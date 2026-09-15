---
data: 2026-09-15
feature: "Coverage Check (F04)"
status: completo
---

# Research: Coverage Check (F04)

## Questão de Pesquisa

Do ticket `thoughts/shared/tickets/2026-09-15-coverage-check.md` → Próximo passo: que campos mínimos de `assets` e `coverage` (schema, RLS) são suficientes para o Coverage Check funcionar sem antecipar o CRUD completo do Warranty Vault (F10), e qual o fluxo mais simples para "criar asset a partir de um documento" reutilizando os campos já extraídos em `ExtractedDocumentData` (`provider`, `date`, `expiry_date`)?

## Sumário

Hoje só existem as tabelas `users` e `documents` em `supabase/schema.sql` — `assets` e `coverage` não existem, e não há nenhum ecrã, hook ou tipo para assets no código. Existe, no entanto, um conjunto consistente de padrões já usados em F01–F03 (Context+hook para estado, funções `async` simples em `src/lib/*.ts` para chamadas Supabase, formulário de preview reutilizando os campos já extraídos) que se aplicam directamente à criação mínima de `assets`/`coverage` e ao ecrã de Coverage Check, sem precisar de nenhuma biblioteca nova (não há React Query nem Zustand no projecto — tudo é `useState`/Context + chamadas directas ao client Supabase).

## Ficheiros Relevantes da Codebase

- `app/(dashboard)/coverage.tsx` — placeholder actual do ecrã de Coverage Check; só título, subtítulo e comentário `TODO: F04`. Nenhuma query.
- `src/components/coverage/` — pasta vazia (0 ficheiros). `CoverageCheckForm`/`CoverageResult` referidos no ticket ainda não existem.
- `src/lib/rulesEngine.ts` — já tem `daysUntil(dateISO, from?)` e `isExpiringSoon(dateISO, thresholdDays=30)`, usadas hoje só em `generateOnboardingInsight`. Directamente reutilizáveis para o estado de cobertura (activo / a expirar em breve / expirado).
- `src/types/documents.ts` — `DocumentType`, `ExtractedDocumentData { document_type, provider, date, amount, expiry_date }`, `UploadedDocument`. Nenhum campo `asset_id` em `UploadedDocument`.
- `src/hooks/useAuth.tsx` — Context com `session`/`user`/`loading`, expõe `supabase.auth`. Fonte de `user.id` para qualquer query filtrada por utilizador.
- `src/hooks/useOnboarding.tsx` — padrão de referência para um hook Context que lê uma tabela Supabase ao montar (`supabase.from('users').select(...).eq('id', userId).single()`) e expõe `loading`/estado. É o modelo mais próximo do que um `useAssets`/`useCoverageCheck` precisaria, adaptado de `.single()` para uma lista (`.select()` sem `.single()`).
- `src/lib/extraction.ts` — `uploadDocument`, `extractDocument`, `saveDocument`, `discardDocument`: todas funções `async` simples que chamam `supabase.from(...)`/`supabase.storage`/`supabase.functions.invoke`. Padrão a seguir para `src/lib/coverage.ts` (ou similar) com `createAssetFromDocument`, `fetchCoverageForAsset`, etc.
- `src/components/documents/DocumentPreviewForm.tsx` — formulário controlado que parte de dados já extraídos (`extracted.provider`, `extracted.date`, `extracted.expiry_date`) e permite corrigir antes de gravar; padrão directamente reutilizável para "criar asset a partir de um documento" (mesma lógica: pré-preencher a partir de `ExtractedDocumentData`, permitir edição, `Confirm`/`Cancel`).
- `src/components/documents/DocumentTypeSelector.tsx` — selector de chips controlado (`value`/`onChange`), sem estado interno próprio; padrão a reutilizar para qualquer selector de tipo de cobertura (`warranty`/`insurance`/`extension`) ou de asset a escolher no Coverage Check.
- `src/components/ui/Button.tsx`, `src/components/ui/Input.tsx` — únicos componentes UI genéricos existentes hoje. **Não existem `Card`, `Badge` ou `Alert`** apesar de estarem listados na estrutura de pastas do `CLAUDE.md` (`src/components/ui/`) — qualquer badge de estado ("Covered"/"Expiring soon"/"Not covered") tem de ser construído de raiz ou introduzido como novo componente reutilizável.
- `src/constants/theme.ts` — `colors.info` (`#5B685F`), `colors.warning` (`#C9A15C`), `colors.critical` (`#A3402E`) na secção "Severidade de alertas". **Não existe nenhum token verde/`success`.**
- `app/(dashboard)/index.tsx` — Dashboard mostra secções "Upcoming renewals" e "Recent insights" como placeholders estáticos (`TODO: F08`), sem nenhuma query ainda — não é um padrão de fetch a copiar, mas mostra o texto/tom esperado (factual, directo) alinhado com `CLAUDE.md` → Tom de comunicação.
- `app/(dashboard)/_layout.tsx` — `Tabs` do Expo Router com 5 separadores fixos (Dashboard, Documents, Coverage, Bills, Settings); não há rotas aninhadas dentro de `(dashboard)/coverage` hoje — se for preciso um ecrã de criação de asset separado, decidir se é modal/rota nova ou secção dentro do próprio `coverage.tsx`.
- `supabase/schema.sql` — só `users` e `documents`. Sem migrations tool: o histórico de commits (`Feature 1`/`2`/`3`) mostra o padrão do projecto — cada feature **acrescenta** `create table if not exists` / `alter table ... add column if not exists` ao mesmo ficheiro, aplicado manualmente no Supabase (sem CLI de migrations).
- `supabase/storage.sql` — padrão de RLS por pasta (`(storage.foldername(name))[1] = auth.uid()::text`) usado no bucket `documents`; não aplicável directamente a `assets`/`coverage` (tabelas normais, não storage), mas confirma a convenção "sempre RLS por dono, nunca bypass" do `CLAUDE.md` regra #4.

## Padrões de Implementação Existentes

**Hook Context que lê uma tabela ao montar** (`src/hooks/useOnboarding.tsx:25-45`):
```tsx
useEffect(() => {
  const userId = session?.user.id;
  if (!userId) { setLoading(false); return; }
  supabase
    .from('users')
    .select('onboarding_completed')
    .eq('id', userId)
    .single()
    .then(({ data }) => {
      setOnboardingCompleted(data?.onboarding_completed ?? false);
      setLoading(false);
    });
}, [session?.user.id]);
```
Para uma lista de assets, o equivalente sem `.single()`:
```ts
supabase.from('assets').select('*').eq('user_id', userId)
```

**Função `async` isolada em `src/lib/*.ts`, sem hook, chamada directamente do componente** (`src/lib/extraction.ts:40-67`, `saveDocument`) — é o padrão a seguir para `createAssetFromDocument`/`saveCoverage`, mantendo a lógica de negócio fora do componente UI (`CLAUDE.md` regra #3).

**Formulário de preview pré-preenchido a partir de dados extraídos, com edição e Confirm/Cancel** (`src/components/documents/DocumentPreviewForm.tsx`) — modelo directo para o ecrã de "criar asset a partir de documento": receber `extracted: ExtractedDocumentData`, inicializar `useState` com os valores já conhecidos (`provider`, `date`→pode mapear a `purchase_date`, `expiry_date`→pode mapear ao `end_date` de uma `coverage` associada), permitir corrigir, e só gravar (`assets` + `coverage`) ao confirmar.

**Selector de chips controlado sem estado interno** (`DocumentTypeSelector.tsx`) — reutilizável tal-e-qual para um selector de asset (lista de assets existentes) ou de tipo de coverage.

**Cálculo de datas 100% determinístico, já isolado do LLM** (`src/lib/rulesEngine.ts:1-11`):
```ts
export function daysUntil(dateISO: string, from: Date = new Date()): number { ... }
export function isExpiringSoon(dateISO: string, thresholdDays: number = 30): boolean { ... }
```
Estas duas funções cobrem toda a regra "coberto / a expirar em breve / não coberto" pedida no ticket — falta apenas compor o resultado (ex.: uma função `getCoverageStatus`) e não existe hoje nada equivalente para "expirado" explicitamente (`isExpiringSoon` devolve `false` tanto para "ainda longe" como para "já expirou"; distinguir os dois casos exige checar `daysUntil(...) < 0` directamente, como já acontece em `generateOnboardingInsight`).

## Tabelas/Queries Supabase Relevantes

**Existem hoje:**
- `users(id, created_at, onboarding_completed, onboarding_goals)`
- `documents(id, user_id, file_url, document_type, provider, date, amount, extracted_data, created_at, expiry_date)` — RLS por `user_id = auth.uid()` em select/insert/update/delete.

**Não existem (necessárias para F04) — schema alvo descrito em `CLAUDE.md`:**
```sql
assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_price numeric,
  created_at timestamptz DEFAULT now()
)

coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  type text,              -- 'warranty' | 'insurance' | 'extension'
  provider text,
  start_date date,
  end_date date,
  status text,             -- 'active' | 'expired' | 'expiring_soon'
  created_at timestamptz DEFAULT now()
)
```
Nota: `coverage` não tem `user_id` directo — RLS terá de ser feita via `EXISTS (SELECT 1 FROM assets WHERE assets.id = coverage.asset_id AND assets.user_id = auth.uid())`, diferente do padrão simples `user_id = auth.uid()` usado em `documents`. Este é o único ponto onde o padrão de RLS existente **não** se aplica directamente — precisa de uma policy com subquery.

O campo `status` em `coverage` (schema do `CLAUDE.md`) sugere um valor persistido, mas `CLAUDE.md` regra #6 exige que o motor de cálculo seja sempre determinístico em runtime — persistir `status` corre o risco de ficar desactualizado (uma cobertura marcada `active` continua assim depois da `end_date` passar, a menos que algo a actualize). Isto é uma questão em aberto (ver abaixo), não uma decisão desta fase.

**`documents` não tem `asset_id`** — não há hoje nenhuma forma de saber que um documento já carregado (ex: uma garantia) pertence a um asset. Se "criar asset a partir de documento" for implementado, `documents.asset_id` (nullable, `references assets(id)`) é o candidato mais directo para fechar essa ligação, seguindo o mesmo padrão incremental (`alter table ... add column if not exists`) já usado nos commits "Feature 1/2/3".

## APIs Externas Relevantes

Nenhuma API externa nova é necessária para esta feature. Coverage Check é puramente "regras determinísticas sobre datas já guardadas" (`CLAUDE.md` — dificuldade 3/10, "dados fornecidos pelo utilizador + regras determinísticas"). Não há chamada a Vision LLM nem a nenhum LLM de explicação nesta ficha — isso só entra se, no futuro, se quiser gerar uma frase em linguagem natural a partir do resultado (como acontece em `generateOnboardingInsight`, que já mistura cálculo determinístico com uma frase fixa gerada em código, não via chamada a um LLM real). O Edge Function `extract-document` (`supabase/functions/extract-document/index.ts`) já existe e não precisa de alterações para esta ficha, porque a criação de asset a partir de documento reaproveita dados já extraídos (`ExtractedDocumentData`), sem nova extracção.

## Code Snippets de Referência

Composição sugerida de estado de cobertura reutilizando o que já existe (apenas para referência — decisão de onde/como implementar fica para `/plan`):
```ts
// src/lib/rulesEngine.ts — hipotético, a decidir em /plan
export type CoverageStatus = 'active' | 'expiring_soon' | 'expired';

export function getCoverageStatus(endDateISO: string, thresholdDays = 30): CoverageStatus {
  const days = daysUntil(endDateISO);
  if (days < 0) return 'expired';
  if (days <= thresholdDays) return 'expiring_soon';
  return 'active';
}
```
Isto reaproveita `daysUntil` sem duplicar lógica de datas, mantendo-se no mesmo ficheiro central de regras determinísticas.

## Questões em Aberto

- **`coverage.status` persistido vs calculado em runtime.** O schema do `CLAUDE.md` inclui uma coluna `status`, mas nada garante que fique sincronizada com a data actual sem um job/trigger. Calcular sempre em runtime (via `getCoverageStatus`) evita dados desactualizados mas diverge ligeiramente do schema documentado. A decidir em `/plan`.
- **Campos mínimos de `assets` para desbloquear o Coverage Check sem antecipar o F10.** O schema completo do `CLAUDE.md` inclui `brand`, `model`, `serial_number`, `purchase_price` — nenhum destes é necessário para responder "está coberto?". Por outro lado, criar a tabela `assets` já completa agora (mesmo sem UI para editar todos os campos) evita uma migração de schema repetida quando o F10 chegar. A decidir em `/plan`: criar `assets` já com o schema completo do `CLAUDE.md` mas só expor `name`/`category` na UI desta ficha, ou criar uma versão reduzida e alargar depois.
- **`documents.asset_id`** — necessário só se "criar asset a partir de documento" ligar automaticamente o documento de origem ao asset criado. Sem este campo, a ligação existe apenas via `coverage.provider`/datas copiadas manualmente para o asset/coverage, sem rasto de qual documento originou aquela cobertura.
- **RLS de `coverage` via subquery a `assets`** — mais complexa do que o padrão `user_id = auth.uid()` usado em `documents`/`users`. Confirmar em `/plan` a policy exacta (select/insert/update/delete) e considerar se compensa desnormalizar `user_id` também em `coverage` para simplificar RLS, à custa de duplicar o dado.
- **Onde vive a criação de asset a partir de documento** — como rota/modal separado (ex: `app/(dashboard)/coverage/new-asset.tsx`) ou como estado dentro do próprio `coverage.tsx` (como o `DocumentUpload` faz hoje com `status: 'previewing'`). Não há hoje nenhuma rota aninhada dentro de `(dashboard)/coverage`, por isso esta decisão tem impacto directo na estrutura de navegação.
- **Token de cor "success"/confirmação** — não existe em `colors` (`src/constants/theme.ts`); nem a paleta oficial do `CLAUDE.md` lista um verde semântico dedicado (os verdes existentes são a escala de marca, não uma cor de estado). Precisa de decisão de design antes do `/plan` (ex: derivar de `#324138` mais claro, ou introduzir um novo hex fora da paleta documentada — o que exigiria actualizar o `CLAUDE.md`).
- **Componentes `Card`/`Badge`** listados na estrutura de pastas do `CLAUDE.md` mas nunca criados — esta ficha é a primeira a precisar claramente de um badge de estado; decidir em `/plan` se vale a pena introduzir `src/components/ui/Badge.tsx` genérico agora (reutilizável por F05/F06/F08, que também têm badges de severidade) em vez de estilizar inline apenas dentro de `CoverageResult`.
