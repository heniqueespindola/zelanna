---
data: 2026-09-17
feature: "Zelanna Agent (F14)"
status: completo
---

# Research: Zelanna Agent (F14)

## Questão de Pesquisa

Documentar o que já existe na codebase que o Zelanna Agent (`thoughts/shared/tickets/2026-09-17-zelanna-agent.md`) pode reaproveitar para: (1) encontrar contratos a renovar nos próximos 60 dias, (2) pesquisar alternativas mais baratas, (3) preparar rascunho de cancelamento/alteração, (4) apresentar com pedido de autorização explícita, (5) executar só após aprovação, (6) registar tudo em audit log — e documentar o que **não existe** e teria de ser criado de raiz.

## Sumário

A detecção de "contratos a renovar" já existe quase por completo: `fetchLifeCalendarEvents` já usa uma janela de **60 dias** (`LIFE_CALENDAR_WINDOW_DAYS`), coincidindo exactamente com o pedido da funcionalidade 1. As funcionalidades 2 (pesquisa de alternativas), 3 (rascunho), 4 (pedido de aprovação estruturado), 5 (execução real) e 6 (audit log rico) **não têm nenhum precedente na codebase** — não há integração de pesquisa externa/web search, não há canal de envio (só de leitura, no caso do Gmail), e o único audit log existente (`estate_access_log`) regista apenas "visualização", não um ciclo proposta→aprovação→execução→resultado. O padrão de confirmação explícita já usado na app (`Alert.alert` com botão destrutivo) é o precedente mais próximo de "pedir autorização", mas é síncrono e sem persistência de estado — insuficiente para o fluxo pedido aqui.

## Ficheiros Relevantes da Codebase

- `src/lib/events.ts:13,120-135` — `LIFE_CALENDAR_WINDOW_DAYS = 60` e `fetchLifeCalendarEvents(userId, windowDays = 60)`: já devolve eventos de renovação (`type: 'renewal'`) de contratos dentro de 60 dias, juntando com os dados do contrato via `joinLifeCalendarEvents`.
- `src/lib/insights.ts:45,610-619` — `RENEWAL_THRESHOLD_DAYS = 30` e `fetchUpcomingRenewals(userId)`: janela diferente (30 dias), usada para o insight informativo `renewal` (F05/F08), não para o Life Calendar.
- `src/lib/rulesEngine.ts:5-24` — `daysUntil`, `isExpiringSoon`, `getCoverageStatus`: funções puras e determinísticas de datas, reaproveitáveis para qualquer janela (30, 60, ou outra).
- `src/lib/contracts.ts:18-26` — `fetchContracts(userId)`: lista todos os contratos do utilizador, incluindo `provider`, `type`, `renewal_date`, `current_amount`.
- `supabase/schema.sql:544-571` — tabela `estate_access_log`: único precedente de audit log no schema. Regista `trusted_person_id`, `section`, `accessed_at`. RLS restrita a `auth.uid() = trusted_people.user_id` via subquery.
- `supabase/schema.sql:374-393` — tabela `gmail_connections`: único precedente de armazenamento de tokens OAuth (`access_token`, `refresh_token`, `scope`, `token_expires_at`, `status: 'active'|'revoked'`). RLS activa sem policies para `anon`/`authenticated` — só `service_role` (dentro de Edge Functions) lê/escreve.
- `supabase/functions/gmail-connect/index.ts` — padrão completo de troca de `serverAuthCode` por `access_token`/`refresh_token` via Google OAuth, chamado a partir do cliente por `supabase.functions.invoke`.
- `supabase/functions/gmail-sync/index.ts:1-80` — padrão de Edge Function que corre tanto via `pg_cron` (sem sessão de utilizador, processa todas as ligações activas) como via chamada directa da app (sessão do utilizador, `scopedUserId` restringe a essa ligação).
- `supabase/functions/extract-document/index.ts` e `supabase/functions/_shared/extraction.ts` — padrão de chamada a um LLM (Anthropic Messages API) para extrair dados estruturados de um documento; devolve JSON parseado com fallback de erro.
- `supabase/functions/explain-insight/index.ts` — padrão de chamada ao mesmo LLM (`model: 'claude-sonnet-5'`) para gerar texto explicativo em linguagem natural a partir de dados já calculados deterministicamente; nunca calcula, só explica.
- `src/lib/insights.ts:111-141,143-174,210-244,307-337` — quatro variantes do padrão "guardar/actualizar um registo com explicação gerada por LLM + fallback determinístico": `saveInsight` (insert simples, acumula histórico), `upsertCoverageGapInsight`, `upsertAssetScopedInsight`, `upsertContractScopedInsight` (todos fazem upsert idempotente sobre um índice único).
- `app/(dashboard)/alerts.tsx:1-90` — ecrã de referência para "apresentar itens accionáveis ao utilizador": gera insights ao focar o ecrã (`useFocusEffect`), lista-os com `InsightCard`, e cada item tem uma acção explícita do utilizador (`Resolve`) que chama uma função async e actualiza o estado local — não há nenhuma acção automática disparada pelo sistema.
- `app/(dashboard)/estate/trusted-people/[id].tsx:75-92` — padrão de confirmação explícita antes de uma acção irreversível: `Alert.alert(título, mensagem, [{Cancel}, {Delete, style: 'destructive', onPress: async () => {...}}])`. É o precedente mais próximo de "pedir autorização explícita antes de uma acção", mas é um diálogo nativo síncrono — não fica persistido como estado revisível antes/depois.
- `.env.example` — variáveis de servidor já documentadas como "nunca no cliente": `VISION_LLM_API_KEY` (comentado; na prática as Edge Functions usam `ANTHROPIC_API_KEY`, ver `supabase/functions/explain-insight/index.ts:143`), `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`. Não existe nenhuma variável reservada para uma API de pesquisa de mercado/comparação de preços.

## Padrões de Implementação Existentes

**Motor determinístico de datas (reaproveitável directamente para "60 dias"):**
```ts
// src/lib/rulesEngine.ts:5-13
export function daysUntil(dateISO: string, from: Date = new Date()): number {
  const target = new Date(dateISO);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - from.getTime()) / msPerDay);
}

export function isExpiringSoon(dateISO: string, thresholdDays: number = 30): boolean {
  const days = daysUntil(dateISO);
  return days >= 0 && days <= thresholdDays;
}
```

**Janela de 60 dias já implementada para o Life Calendar — coincide com o pedido da funcionalidade 1:**
```ts
// src/lib/events.ts:13,120-135
const LIFE_CALENDAR_WINDOW_DAYS = 60;
...
export async function fetchLifeCalendarEvents(
  userId: string,
  windowDays: number = LIFE_CALENDAR_WINDOW_DAYS
): Promise<LifeCalendarEntry[]> {
  const [contracts, assets, coverage] = await Promise.all([
    fetchContracts(userId).then((cs) => cs.filter((c) => c.renewal_date !== null)),
    fetchAssets(userId),
    fetchCoverageForUser(),
  ]);
  ...
  const events = await fetchUpcomingEvents(userId, windowDays);
  return joinLifeCalendarEvents(events, contracts, assets, coverageByAsset);
}
```

**Padrão de Edge Function autenticada (auth de utilizador + service_role para bypass de RLS quando necessário):**
```ts
// supabase/functions/gmail-connect/index.ts:9-27 (repetido em extract-document, explain-insight)
const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
});
const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const { data: { user } } = await supabaseAuthed.auth.getUser();
if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... });
```

**Padrão de Edge Function chamável tanto por cron como pela app, com scoping condicional ao utilizador:**
```ts
// supabase/functions/gmail-sync/index.ts:38-57
let scopedUserId: string | null = null;
const authHeader = req.headers.get('Authorization') ?? '';
if (authHeader) {
  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseAuthed.auth.getUser();
  if (user) scopedUserId = user.id;
}
let connectionsQuery = supabaseService.from('gmail_connections').select(...).eq('status', 'active');
if (scopedUserId) connectionsQuery = connectionsQuery.eq('user_id', scopedUserId);
```

**Padrão de chamada ao LLM (Anthropic Messages API directa, sem SDK, dentro de Edge Function Deno):**
```ts
// supabase/functions/explain-insight/index.ts:118-131 (idêntico em _shared/extraction.ts:26-40)
const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    system: EXPLAIN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(body) }],
  }),
});
```
Nenhuma destas duas chamadas usa tools (nem `web_search`, nem qualquer outra tool da Anthropic Messages API) — são chamadas simples de texto/imagem-para-texto, sem acesso à internet.

**Padrão de confirmação explícita antes de acção irreversível (o precedente mais próximo de "pedir autorização"):**
```ts
// app/(dashboard)/estate/trusted-people/[id].tsx:75-92
const handleDelete = () => {
  if (!person) return;
  Alert.alert(
    'Delete trusted person?',
    'This also removes their permissions and audit log. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteTrustedPerson(person.id);
          router.back();
        },
      },
    ]
  );
};
```

**Padrão de audit log existente (único precedente, mas mais simples do que o pedido nesta ficha — só regista visualização, não um ciclo de aprovação):**
```sql
-- supabase/schema.sql:544-571
create table if not exists public.estate_access_log (
  id uuid default gen_random_uuid() primary key,
  trusted_person_id uuid references public.trusted_people(id) on delete cascade,
  section text not null,
  accessed_at timestamptz not null default now()
);
-- RLS: só o dono (via trusted_people.user_id = auth.uid()) pode ver; insert também owner-side
-- nesta fase (comentário no schema explica que isto muda quando houver conta própria da trusted person)
```

## Tabelas/Queries Supabase Relevantes

- **`contracts`** (`supabase/schema.sql:228-238`): `renewal_date`, `provider`, `type` ('insurance'|'utility'|'subscription'|'other'), `current_amount`. É a tabela-fonte para a funcionalidade 1. Sem coluna `status`/`is_active` — nenhuma forma de saber se um contrato já foi cancelado fora da app.
- **`events`** (`supabase/schema.sql:346-354`): `type` ('renewal'|'expiry'|'deadline'), `due_date`, `source_id` (aponta para `contracts`/`assets`), `unique(source_id, type)`. Já sincronizado por `syncRenewalEvents`/`syncAssetLifeEvents` sempre que `fetchLifeCalendarEvents` corre.
- **`insights`** (`supabase/schema.sql:261-344`): padrão de `type`/`severity`/`data jsonb`/`message`/`resolved_at`, com índices únicos parciais para idempotência (`insights_coverage_gap_unique`, `insights_asset_scoped_unique`, `insights_contract_scoped_unique`). Precedente de esquema a seguir se uma futura tabela `agent_actions` quiser o mesmo padrão de upsert idempotente e resolução.
- **`gmail_connections`** (`supabase/schema.sql:374-393`): único precedente de armazenamento de tokens OAuth com `scope` como texto livre devolvido pela Google — se um canal de execução via Gmail (enviar email) for escolhido, o `scope` guardado teria de incluir `gmail.send` (ou equivalente), distinto do scope actual (só leitura de anexos, `CLAUDE.md`: "Nunca ler indiscriminadamente a caixa de correio").
- **`estate_access_log`** (`supabase/schema.sql:544-571`): ver acima — precedente de audit log, mas sem estado de aprovação/execução/resultado.
- **Não existe nenhuma tabela** para: propostas de acção do agente, aprovações, rascunhos de comunicação, ou resultados de execução. Não existe nenhuma tabela para "alternativas de fornecedor" nem cache de pesquisa de mercado.

## APIs Externas Relevantes

- **Anthropic Messages API** (`https://api.anthropic.com/v1/messages`, modelo `claude-sonnet-5`, header `x-api-key: ANTHROPIC_API_KEY`): já usada em duas Edge Functions (`extract-document`/`_shared/extraction.ts` para extracção Vision, `explain-insight` para explicação em linguagem natural). Ambas as chamadas actuais são simples (sem tools). A Anthropic Messages API suporta um `web_search` server-side tool que **não está usado em nenhum ponto do codebase actual** — seria a via mais directa, dentro do stack já existente, para a funcionalidade 2 ("pesquisar alternativas mais baratas"), mas isso é uma decisão de design, não um facto já implementado.
- **Google OAuth / Gmail API** (`supabase/functions/gmail-connect`, `gmail-sync`, `_shared/googleClient.ts`): o fluxo actual usa `GoogleSignin` (client nativo) para obter um `serverAuthCode`, trocado no servidor por `access_token`/`refresh_token`. O `scope` pedido hoje é apenas leitura de Gmail (não inspeccionado nesta pesquisa ao nível exacto da string de scope, mas `gmail-sync` só lista/descarrega mensagens e anexos — nunca envia). Não há nenhuma chamada de escrita/envio (`messages.send`) em nenhum ficheiro da codebase.
- **Nenhuma API de comparação de preços/mercado está integrada** — `CLAUDE.md` → `## Roadmap` lista explicitamente "external market valuation APIs" em "Não construir ainda", e não há nenhum ficheiro, variável de ambiente reservada, ou referência a um fornecedor de dados de mercado em todo o repositório.

## Code Snippets de Referência

Ver secção `## Padrões de Implementação Existentes` acima — inclui os quatro padrões mais directamente reaproveitáveis: cálculo determinístico de datas, sincronização de eventos de renovação numa janela de 60 dias, chamada a Edge Function autenticada, e confirmação explícita do utilizador antes de acção irreversível.

## Questões em Aberto

Estas são as mesmas questões já registadas em `thoughts/shared/tickets/2026-09-17-zelanna-agent.md` → `## Notas técnicas`, agora confirmadas (ou refinadas) à luz do que existe de facto na codebase:

1. **Janela de 60 dias**: **resolvida por reaproveitamento directo** — `LIFE_CALENDAR_WINDOW_DAYS = 60` em `src/lib/events.ts:13` já é exactamente a janela pedida pela funcionalidade 1; `fetchLifeCalendarEvents` já devolve contratos com `renewal_date` nessa janela, juntamente com dados do contrato. Não é necessária uma constante nova para esta parte — a decisão em aberto é apenas se F14 consome `fetchLifeCalendarEvents` directamente ou filtra o resultado só para `source: 'contract'`.
2. **Fonte de dados para "alternativas mais baratas"** — continua sem resposta. A opção tecnicamente mais próxima do stack actual é o `web_search` tool da Anthropic Messages API (o mesmo modelo `claude-sonnet-5` já usado, mas com uma tool nunca antes activada neste codebase); não há nenhuma base de dados curada nem API de mercado integrada hoje.
3. **Canal de execução real** — continua sem resposta. Não existe nenhum scope de envio de email nem qualquer outro canal de escrita para fornecedores/seguradoras em todo o repositório. A extensão mais directa do padrão OAuth já existente seria adicionar um scope de envio Gmail (`gmail-connect`/`gmail_connections`), o que exigiria novo consentimento explícito do utilizador, distinto do actual.
4. **Modelo de dados do audit log** — `estate_access_log` é o único precedente e é estruturalmente mais simples do que o pedido (só "visualização", sem workflow de estados). O padrão de índices únicos parciais de `insights` (`supabase/schema.sql:338-344,597-599`) é o precedente mais próximo para uma tabela nova com ciclo de vida (proposto → aprovado → executado → falhou).
5. **Contratos já cancelados fora da app** — `contracts` não tem `status`/`is_active`; qualquer listagem de "contratos a renovar" pode incluir contratos que o utilizador já cancelou por fora, sem que a app saiba. Não encontrado nenhum mecanismo existente para marcar um contrato como inactivo.
