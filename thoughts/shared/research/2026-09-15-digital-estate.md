---
data: 2026-09-15
feature: "Digital Estate (F11) — trusted-person access, important documents, permissions e audit log"
status: completo
---

# Research: Digital Estate (F11)

## Questão de Pesquisa

Do "Próximo passo" da ficha `thoughts/shared/tickets/2026-09-15-digital-estate.md`:

> Qual o mecanismo mínimo de acesso de uma trusted person (magic link sem conta própria vs. conta Supabase Auth própria com RLS estendido) que permite implementar um audit log real em `estate_access_log`, e como reaproveitar ao máximo `documents`/`DocumentType` (`src/types/documents.ts`) e o padrão de CRUD de `src/lib/coverage.ts` sem duplicar o pipeline de upload/extração já existente?

## Sumário

O F11 é **100% greenfield** — confirmado por duas pesquisas independentes: não existe nenhuma tabela, tipo, função ou ecrã relacionado com trusted people, digital/financial assets, permissões ou audit log em todo o repositório, e o único hit é copy cosmético no onboarding (`app/onboarding/step1.tsx:12,31`). A app tem hoje **um único mecanismo de identidade** (email+password via `auth.users`, um só cliente Supabase com anon key) e **nenhuma policy de RLS referencia mais do que um `auth.uid()`** — todas as 8 tabelas com RLS usam ou ownership directo (`auth.uid() = user_id`) ou o padrão de join-ao-pai (via `assets.user_id`), nunca um segundo uid. Isto significa que dar acesso real a uma trusted person exige construir um mecanismo novo, não reutilizar nada existente ao nível de RLS. A pesquisa externa (Supabase docs + comunidade) aponta claramente para **`auth.admin.inviteUserByEmail()` via Edge Function (cria conta própria para a trusted person) + tabela de permissões com RLS EXISTS + RPC `SECURITY DEFINER` para o audit log** como o padrão idiomático — e o próprio repositório já tem um precedente quase idêntico a esse desenho (`gmail-connect`/`gmail-status`/`gmail-disconnect` + tabela `gmail_connections` com RLS activo e zero policies para o cliente, só `service_role`). Quanto a "important documents": reutilizar `documents.document_type` adicionando `'will'`/`'certificate'` é seguro ao nível da BD (coluna `text` sem CHECK constraint) e não obriga a alterar `src/lib/coverage.ts`/`contracts.ts`, mas **obriga a editar o prompt da Vision LLM** em `supabase/functions/_shared/extraction.ts` (o enum de 5 valores está hardcoded no texto do prompt) e a UI de override manual em `DocumentTypeSelector.tsx`.

## Ficheiros Relevantes da Codebase

- `supabase/schema.sql:1-421` — schema completo; nenhuma tabela de estate existe; ver secção RLS abaixo para os dois únicos padrões de policy usados no repo
- `supabase/storage.sql` (15 linhas) — policies do bucket `documents`, mesmo idioma de ownership por pasta (`(storage.foldername(name))[1] = auth.uid()::text`)
- `src/lib/supabase.ts:1-19` — cliente Supabase único (anon key, sessão persistida em `AsyncStorage`, `detectSessionInUrl: false` — **não há hoje parsing de deep link/magic link no cliente**)
- `src/hooks/useAuth.tsx:1-72` — `AuthProvider`/`useAuth()`: `getSession()` + `onAuthStateChange` (listener já existe, mas sem branch por tipo de evento), `signIn`/`signUp`/`signOut`, `AppState` liga/desliga `startAutoRefresh`
- `app/_layout.tsx:1-53` — `Stack.Protected` com 3 branches (`(dashboard)` / `onboarding` / `(auth)`) baseado em `session` + `onboardingCompleted`; assume sempre uma única sessão/identidade
- `src/lib/authErrors.ts` (20 linhas) — `getAuthErrorMessage`, `isValidEmail`; únicos consumidores são `app/(auth)/login.tsx` e `app/(auth)/register.tsx`
- `supabase/functions/gmail-connect/index.ts`, `gmail-disconnect/index.ts`, `gmail-status/index.ts` — **precedente mais próximo** de "Edge Function resolve identidade do chamador via JWT + `service_role` escreve numa tabela que o cliente nunca toca directamente"
- `supabase/functions/gmail-sync/index.ts:35-51` — precedente de **auth opcional** na Edge Function (JWT presente → âmbito a um utilizador; ausente → `service_role` chamado por `pg_cron`, processa todos) — padrão relevante se um futuro "estate-access" endpoint precisar de correr tanto por um utilizador autenticado como por um token de convite
- `src/types/documents.ts:1-33` — `DocumentType` (5 valores), `ExtractedDocumentData`, `ExtractionResult`, `UploadedDocument`
- `src/lib/extraction.ts:1-76` — `uploadDocument` → `extractDocument` → `saveDocument` → `discardDocument`; `document_type` só ganha valor a partir de `extractDocument` (decidido pela Vision LLM) ou override manual na UI
- `supabase/functions/_shared/extraction.ts:2,14-25` — **o enum de 5 `document_type` está hardcoded no prompt da Claude Vision API** (linha 18) — ponto de edição obrigatório para suportar `'will'`/`'certificate'`
- `src/components/documents/DocumentTypeSelector.tsx:11-15` — picker de override manual, duplica a lista de tipos como array de `{value, label}`
- `src/lib/coverage.ts:1-287` — convenção de CRUD a replicar em `src/lib/estate.ts` (ver Padrões abaixo); nenhuma chamada a `supabase.rpc(...)` neste ficheiro — tudo client-side, sem transacções

## Padrões de Implementação Existentes

**RLS — ownership directo** (`assets`, `contracts`, `bills`, `documents`, `insights`, `events`, `users`):
```sql
create policy "Users can view own assets"
  on public.assets for select
  using (auth.uid() = user_id);
```

**RLS — join ao pai** (`coverage`, `maintenance`, `claims`, todas idênticas):
```sql
create policy "Users can view own coverage"
  on public.coverage for select
  using (exists (
    select 1 from public.assets
    where assets.id = coverage.asset_id and assets.user_id = auth.uid()
  ));
```

**RLS activo sem policies para o cliente** (`gmail_connections`, `schema.sql:386-390`) — o precedente directo para uma tabela só gerida por Edge Functions com `service_role` (relevante para `estate_access_log` e potencialmente `trusted_person_permissions` se o desenho final passar por uma Edge Function em vez de RLS directo):
```sql
alter table public.gmail_connections enable row level security;
-- sem create policy — só service_role (usado dentro das Edge Functions gmail-*)
```

**CRUD em `src/lib/coverage.ts`** — `fetchAssets` (fetch simples, columns const, `?? []`):
```ts
const ASSET_COLUMNS =
  'id, user_id, name, category, brand, model, serial_number, purchase_date, purchase_price, seller, return_deadline, created_at';

export async function fetchAssets(userId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load assets');
  return data ?? [];
}
```

`createAsset` (params camelCase → insert snake_case → `.select(COLUMNS).single()` → throw terso):
```ts
export async function createAsset(params: {
  userId: string; name: string; category: AssetCategory | null; /* ... */
}): Promise<Asset> {
  const { data, error } = await supabase
    .from('assets')
    .insert({ user_id: params.userId, name: params.name, category: params.category, /* ... */ })
    .select(ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create asset');
  return data;
}
```
`update*` recebe `Partial<...>` já em snake_case e passa directo a `.update(params)`; `delete*` é sempre `.delete().eq('id', id)` + throw terso, sem valor de retorno. Este é o conjunto de convenções a seguir em `src/lib/estate.ts`.

**Edge Function — identidade do chamador via JWT + `service_role` para escrita privilegiada** (`gmail-connect/index.ts`, forma resumida):
```ts
const supabaseAuthed = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
const { data: { user }, error } = await supabaseAuthed.auth.getUser();
if (error || !user) return new Response('Unauthorized', { status: 401 });

const supabaseService = createClient(url, serviceRoleKey);
await supabaseService.from('gmail_connections').upsert({ user_id: user.id, /* ... */ });
```

## Tabelas/Queries Supabase Relevantes

Nenhuma tabela de estate existe. Tabelas a criar (propostas já na ficha F11, confirmadas como não colidindo com nada existente):
- `digital_assets`, `financial_assets`, `trusted_people` — ownership directo (`auth.uid() = user_id`), mesmo padrão de `assets`/`contracts`/`bills`.
- `trusted_person_permissions` — join ao pai via `trusted_people.user_id`, mesmo padrão de `coverage`/`maintenance`/`claims`.
- `estate_access_log` — candidato a seguir o padrão `gmail_connections` (RLS activo, sem policies de insert para o cliente — só escrita via RPC/Edge Function `SECURITY DEFINER`; policy de select só para o dono via `auth.uid() = user_id`).
- `documents.document_type` — extensão aditiva e não destrutiva (`text` sem CHECK constraint, `schema.sql:40`) para incluir `'will'`/`'certificate'`.

## APIs Externas Relevantes

**Supabase Auth — convite de uma segunda identidade** (`auth.admin.inviteUserByEmail()`): chamada admin-only, exige `service_role`, corre só em Edge Function. Cria de imediato uma linha em `auth.users` (por confirmar) e envia email de convite; permite anexar `user_metadata` (ex: `invited_by`, `role`) no momento do convite — dá um `auth.uid()` estável para referenciar em `trusted_person_permissions` antes mesmo do primeiro login. Fontes: `supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail`, `blog.mansueli.com/allowing-users-to-invite-others-with-supabase-edge-functions`, GitHub discussion supabase#6055.

**RLS — padrão "shared access via grants table"**: policy com `EXISTS` a apontar para uma tabela de permissões (`owner_id`, `grantee_id`, `section`). Duas notas críticas da pesquisa: (a) se a tabela de permissões também tiver RLS que referencia outras tabelas protegidas, há risco de **recursão** — mitigação padrão é uma função `SECURITY DEFINER` (com `SET search_path = ''`) que verifica pertença como o dono da tabela; (b) subqueries `EXISTS` correm **por linha**, por isso `grantee_id`/`resource_owner_id` precisam de índice. Fonte: `supabase.com/docs/guides/database/postgres/row-level-security`, dev.to "Supabase RLS Policy Design Patterns Beyond the Basics".

**Audit log de "visualização"**: confirmado — Postgres **não tem trigger em `SELECT`**. O padrão idiomático é uma RPC `SECURITY DEFINER` (ex: `log_view(resource_id, section)`) chamada pelo cliente logo após um fetch bem-sucedido, que insere em `estate_access_log` a contornar RLS; leitura do log continua restrita ao dono via policy normal `auth.uid() = user_id`. `pgaudit` foi considerado e descartado — audita ao nível de sessão/statement do Postgres, não semântica de "utilizador X viu o registo Y". Fonte: Medium "Simple Audit Trail for Supabase", `supabase.com/docs/guides/database/extensions/pgaudit`.

**Magic link em Expo**: lift pequeno-a-médio, bem documentado — custom `scheme` no `app.json`, `Linking.createURL()`/`makeRedirectUri()`, registar o redirect no Supabase Auth, ouvir o deep link (`expo-linking`) e extrair tokens (`setSession()` directo, estilo implícito) ou usar `flowType: 'pkce'` + `exchangeCodeForSession` + `detectSessionInUrl: false`. **Nota importante**: o cliente actual já tem `detectSessionInUrl: false` (`src/lib/supabase.ts:15`) — ou seja, hoje o parsing automático de URL de sessão está explicitamente desligado, pelo que qualquer fluxo de magic link exigiria lidar com isto manualmente (via `Linking` + `exchangeCodeForSession`), não é "ligar uma flag". Fontes: `supabase.com/docs/guides/auth/native-mobile-deep-linking`, dev.to "why the OAuth deep link never comes back", GitHub discussion supabase#6698.

## Code Snippets de Referência

Ver secção "Padrões de Implementação Existentes" acima — inclui os três padrões directamente reutilizáveis (RLS ownership directo, RLS join-ao-pai, CRUD `fetchX`/`createX`) e o padrão de Edge Function com dois clientes (`supabaseAuthed` para identidade, `supabaseService` para escrita privilegiada) que é o precedente mais próximo de como uma futura function de acesso de trusted person deveria ser estruturada.

## Questões em Aberto

1. **Opção (a) vs (b) para o mecanismo de acesso da trusted person** — a ficha já tinha identificado ambas; a pesquisa externa inclina claramente para a **opção (b) — `inviteUserByEmail` + conta própria + RLS com segundo `auth.uid()`** por ser consistente com o resto do schema (que só usa `auth.uid()`, nunca tokens/claims custom) e por ser o padrão oficialmente documentado pela Supabase. A opção (a) (magic link/token sem conta) exigiria construir uma camada de autorização paralela ao RLS existente — mais trabalho de raiz, sem precedente no repo. **Decisão a tomar em `/plan`**, mas a recomendação da pesquisa pende para (b).
2. **Risco de recursão de RLS** na tabela `trusted_person_permissions` (e em qualquer policy de `digital_assets`/`financial_assets`/`important_documents` que passe a verificar essa tabela) — se se avançar com acesso real (não só gestão do lado do dono), `/plan` deve desenhar já com uma função `SECURITY DEFINER` para evitar o problema documentado, em vez de descobrir isto em produção.
3. **Prompt da Vision LLM tem de ser editado e a Edge Function `extract-document` redeployed** para que `'will'`/`'certificate'` alguma vez sejam extraídos automaticamente — isto é trabalho real, não uma mudança de configuração; até lá, os dois tipos novos só funcionariam via override manual em `DocumentTypeSelector.tsx` (que também precisa das duas opções novas).
4. **`detectSessionInUrl: false` no cliente Supabase actual** significa que magic link/OTP não "simplesmente funciona" — se `/plan` escolher qualquer fluxo baseado em link por email (mesmo só para o convite inicial da trusted person, antes de definir password), o handling do deep link tem de ser construído de propósito.
5. **Timing do audit log real vs. modelo de dados** — a ficha F11 já aceita que o audit log pode ficar "populado manualmente" nesta fase; esta pesquisa confirma que a via correcta quando o acesso real existir é uma RPC `SECURITY DEFINER` chamada pelo cliente no momento da visualização (não um trigger), o que deve ser desenhado desde já na forma da tabela `estate_access_log` para não exigir migração depois.
