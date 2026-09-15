---
data: 2026-09-15
feature: "Renewal / Price Increase Detection (F05)"
status: completo
---

# Research: Renewal / Price Increase Detection (F05)

## Questão de Pesquisa

Que estrutura mínima de `contracts` (schema, RLS, e ligação a `documents` via `contract_id`) é suficiente para agrupar documentos do mesmo fornecedor ao longo do tempo, e que critério de matching de `provider` é suficientemente determinístico para evitar falsos positivos/negativos sem exigir normalização de texto complexa? (questão herdada do ticket `thoughts/shared/tickets/2026-09-15-renewal-price-increase-detection.md`, alargada aqui ao levantamento completo necessário para `/plan`.)

## Sumário

O motor de cálculo determinístico (percentagens, médias, dias até renovação) **já existe e está pronto a reutilizar** em `src/lib/rulesEngine.ts`. O que falta construir é inteiramente estrutural: as tabelas `contracts` e `insights` não existem no schema aplicado, não há nenhum campo que agrupe documentos do mesmo fornecedor ao longo do tempo, e não existe nenhuma edge function nem chamada LLM de "explicação" no código — o F04 (Coverage Check), o único feature de resultado/insight já implementado, usa apenas templates de texto fixos, nunca um LLM. F05 seria a primeira feature a introduzir esse padrão.

## Ficheiros Relevantes da Codebase

- `src/lib/rulesEngine.ts:63-79` — `percentageChange(current, previous)`, `isSignificantIncrease(current, previous, thresholdPercent=10)`, `isAnomaly(current, average, thresholdPercent=25)`, `average(values)`. Motor de cálculo genérico, sem dependência de nenhuma tabela específica — pronto a chamar a partir de qualquer sítio que tenha dois valores numéricos.
- `src/lib/rulesEngine.ts:1-22` — `daysUntil(dateISO, from?)` e `isExpiringSoon(dateISO, thresholdDays=30)`. Já usadas pelo F04; reutilizáveis para o cálculo de "dias até renovação", mas o threshold do F04 é 30 dias e o exemplo do F05 é 17 dias — confirmar se `isExpiringSoon` recebe o threshold como parâmetro já (recebe: `thresholdDays` tem default 30 mas é sobreponível) ou se compensa criar uma função dedicada a renovações.
- `src/lib/rulesEngine.ts:24-61` — `getCoverageStatus`, `evaluateCoverage`, `COVERAGE_TYPE_RANK`. Específico do F04 (coverage warranty/insurance/extension), não aplicável directamente a F05, mas é o exemplo mais próximo de "função de avaliação que combina datas + prioridade" caso F05 precise de algo semelhante para escolher qual contrato/documento é o "mais recente" quando há ambiguidade.
- `src/lib/coverage.ts` — camada de acesso a dados do F04 (`fetchAssets`, `fetchCoverageForAsset`, `fetchDocumentsWithoutAsset`, `createAssetFromDocument`). Padrão a seguir para uma futura `src/lib/contracts.ts` ou `src/lib/renewals.ts`: funções `async` finas sobre `supabase.from(...)`, sempre com `SELECT columns` explícitas numa constante (`ASSET_COLUMNS`, `COVERAGE_COLUMNS`), sempre lançando `Error` com mensagem curta em caso de `error`.
- `src/lib/extraction.ts` — camada de acesso a dados do F03 (upload + extracção). `extractDocument()` chama `supabase.functions.invoke<ExtractedDocumentData>('extract-document', { body: params })` — este é o único ponto do código que já invoca uma Edge Function a partir do cliente. É o padrão a replicar para uma futura chamada a `explain-insight`.
- `app/(dashboard)/coverage.tsx` — ecrã do F04, totalmente implementado (**não** é placeholder, ao contrário do que o ticket de F04 registava — ver "Questões em Aberto"). Padrão de ecrã: sem hook dedicado, fetch directo em `useEffect` chamando funções de `src/lib/coverage.ts`, estado local via `useState`, composição de dois componentes (`CoverageCheckForm` para input, `CoverageResult` para output).
- `src/components/coverage/CoverageResult.tsx` — mostra como o F04 apresenta o resultado: usa `Badge` (tone `success`/`warning`/`critical`) e funções puras locais (`gapMessage`, `nextActionText`) que geram texto **hardcoded**, não LLM. Confirma que hoje **não existe nenhum precedente de mensagem gerada por LLM fora da extracção de documentos**.
- `src/components/documents/DocumentUpload.tsx:25-39` — `processAsset()` mostra o padrão de estados (`idle → uploading → extracting → previewing → done → error`) para operações assíncronas com Edge Function; útil como referência para o fluxo de geração de insight (calcular → chamar LLM de explicação → guardar → mostrar), incluindo tratamento de erro com fallback (`catch { setStatus('error') }`).
- `src/hooks/useAuth.tsx` — único hook de contexto existente; expõe `user: User | null`. Todas as chamadas a `src/lib/*` recebem `user.id` explicitamente (não há um hook `useUser()` separado).
- `app/(dashboard)/index.tsx` — dashboard com card "Upcoming renewals" (`"No renewals tracked yet."`) já presente na UI mas sem leitura de dados; comentário no código atribui esta área a `TODO: F08`.
- `app/(dashboard)/bills.tsx` — placeholder puro, comentário `TODO: F06/F07`, sem relação directa com F05 mas confirma que a tabela `bills` (categorias água/luz/gás) não é usada nem necessária para F05.
- `supabase/functions/extract-document/index.ts` — única Edge Function existente. Estrutura: auth do pedido via `Authorization` header + `supabaseAuthed.auth.getUser()`, cliente `service_role` separado só para operações que passam RLS (aqui, `storage.download`), chamada directa a `https://api.anthropic.com/v1/messages` com `ANTHROPIC_API_KEY` do ambiente, `model: 'claude-sonnet-5'`, prompt de sistema que exige "responda APENAS com JSON, sem prosa", parse com `try/catch` e resposta 422 em caso de falha de parsing.

## Padrões de Implementação Existentes

**Camada de dados (`src/lib/*.ts`) — padrão de `src/lib/coverage.ts`:**
```typescript
const ASSET_COLUMNS = 'id, user_id, name, category, ...';

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
Uma futura `src/lib/contracts.ts` (ou `renewals.ts`) deve seguir exactamente esta forma: colunas explícitas, `throw new Error(...)` com mensagem curta, sem try/catch aninhado.

**Chamada a Edge Function a partir do cliente — padrão de `src/lib/extraction.ts`:**
```typescript
export async function extractDocument(params: {
  documentPath: string;
  mimeType: string;
}): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke<ExtractedDocumentData>(
    'extract-document',
    { body: params }
  );
  if (error || !data) throw new Error('Extraction failed');
  return { documentPath: params.documentPath, mimeType: params.mimeType, extracted: data };
}
```
Uma futura `explainInsight()` em `src/lib/insights.ts` chamaria `supabase.functions.invoke('explain-insight', { body: { provider, type, previousAmount, currentAmount, percentageChange, daysUntilRenewal } })`.

**Edge Function — padrão de `supabase/functions/extract-document/index.ts`:**
```typescript
const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
});
const { data: { user } } = await supabaseAuthed.auth.getUser();
if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, ... });

const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', ... },
  body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1024, system: PROMPT, messages: [...] }),
});
```
Uma futura `explain-insight` function não precisa de `service_role` nem de `storage.download` (não lê ficheiros) — só precisa de autenticar o pedido e devolver texto. É mais simples que `extract-document`.

**Motor de cálculo — já pronto, não recriar:**
```typescript
// src/lib/rulesEngine.ts
export function percentageChange(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}
export function isSignificantIncrease(current: number, previous: number, thresholdPercent = 10): boolean {
  return percentageChange(current, previous) > thresholdPercent;
}
```

**Composição de ecrã — padrão de `app/(dashboard)/coverage.tsx`:** fetch em `useEffect` + `useState`, sem hook dedicado, dois componentes (input/selector + result). Uma futura tela `app/(dashboard)/renewals.tsx` (nome a decidir) seguiria a mesma forma.

**Badge de severidade — `src/components/ui/Badge.tsx`:** `tone: 'success' | 'warning' | 'critical' | 'info'`, mapeado directamente para `colors.success/warning/critical/info` do tema. Reutilizável tal e qual para os insights de F05 (ex: `warning` para price_increase, `info` para renewal distante, `critical` para renovação muito próxima).

## Tabelas/Queries Supabase Relevantes

**Schema aplicado hoje (`supabase/schema.sql`) — só 4 tabelas:**
- `users` (id, created_at, onboarding_completed, onboarding_goals)
- `documents` (id, user_id, file_url, document_type, provider, date, amount, extracted_data jsonb, expiry_date, **asset_id** — adicionado para o F04)
- `assets` (id, user_id, name, category, brand, model, serial_number, purchase_date, purchase_price)
- `coverage` (id, asset_id, type, provider, start_date, end_date, status[não usado])

**Não existem:** `contracts`, `bills`, `events`, `insights` — nenhuma das quatro tabelas descritas em `CLAUDE.md` além de `assets`/`coverage` foi criada.

**RLS — dois padrões já estabelecidos, a replicar para `contracts`/`insights`:**
1. Tabela com `user_id` directo (`documents`, `assets`): 4 policies (select/insert/update/delete) todas `using (auth.uid() = user_id)` / `with check (auth.uid() = user_id)`.
2. Tabela sem `user_id` directo, ligada por FK (`coverage`, ligada a `assets.user_id`): 4 policies com `exists (select 1 from public.assets where assets.id = coverage.asset_id and assets.user_id = auth.uid())`.

`contracts` teria `user_id` directo → padrão 1. `insights` também teria `user_id` directo (`CLAUDE.md` já o modela assim) → padrão 1. Não é necessário o padrão 2 para esta ficha.

**Query de matching de fornecedor — não existe hoje nenhuma.** Não há índice nem função SQL para agrupar `documents.provider` por semelhança. Qualquer matching seria feito client-side (JS) sobre o texto já carregado, ou por igualdade exacta numa cláusula `.eq('provider', ...)` do Supabase JS client.

**Colunas de `documents` relevantes para o matching/comparação:** `provider` (texto livre), `document_type` (`'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt'`), `date`, `amount`, `expiry_date`, `asset_id` (nullable — documentos de bills/seguros recorrentes normalmente não têm asset associado, ao contrário do fluxo F04).

## APIs Externas Relevantes

**Anthropic Messages API** (única API externa de IA usada no projecto, via `fetch` directo, sem SDK):
- Endpoint: `https://api.anthropic.com/v1/messages`
- Header obrigatório: `anthropic-version: 2023-06-01`
- Auth: `x-api-key` (variável de ambiente `ANTHROPIC_API_KEY`, nunca no cliente — só na Edge Function, conforme `.env` comentado no `CLAUDE.md`)
- Modelo usado no código: `'claude-sonnet-5'`
- Padrão de prompt para output estruturado: instrução explícita "respond with ONLY a JSON object, no prose, no markdown fences" + parse com `JSON.parse` e tratamento de erro (`try/catch` → resposta 422). Para F05, o caso é o inverso (input estruturado → output só texto), pelo que o prompt de sistema deve pedir explicitamente frase curta, sem JSON, no idioma da UI (inglês, `CLAUDE.md` regra #12), e sem inventar números que não estejam no payload.
- Não há limites de quota documentados no repositório (sem ficheiro de config de rate limit); nada a herdar daqui além do padrão de chamada.

**Supabase Edge Functions (Deno):**
- `createClient` do `npm:@supabase/supabase-js@2` (import via `npm:` specifier, padrão Deno)
- Duas instâncias de cliente possíveis: `supabaseAuthed` (com o `Authorization` header do pedido, para `auth.getUser()` e para respeitar RLS) e `supabaseService` (com `SUPABASE_SERVICE_ROLE_KEY`, só quando é preciso ignorar RLS — ex: ler Storage). Para `explain-insight`, provavelmente só é preciso `supabaseAuthed` (autenticar o pedido), sem necessidade de `service_role`, já que a function não lê nenhuma tabela — recebe os números já calculados no body do pedido.

**Stripe / Gmail API:** não relevantes para esta ficha (fase posterior / feature não relacionada).

## Code Snippets de Referência

Fluxo completo de estados assíncronos com Edge Function + fallback de erro (`DocumentUpload.tsx:25-39`):
```typescript
const processAsset = async (params: {...}) => {
  if (!user) return;
  setErrorMessage(null);
  setStatus('uploading');
  try {
    const { documentPath } = await uploadDocument({ userId: user.id, ...params });
    setStatus('extracting');
    const result = await extractDocument({ documentPath, mimeType: params.mimeType });
    setExtraction(result);
    setStatus('previewing');
  } catch {
    setStatus('error');
    setErrorMessage('Something went wrong. Please try again.');
  }
};
```
Este é o modelo a seguir para "calcular → pedir explicação ao LLM → guardar insight", incluindo o fallback determinístico pedido no ticket (se o `catch` disparar na chamada ao LLM, o insight já calculado deterministicamente não deve perder-se — ao contrário deste exemplo, que descarta tudo em caso de erro).

Função de avaliação pura, testável, sem I/O (`rulesEngine.ts:33-58`, `evaluateCoverage`) — modelo para uma futura função `evaluateRenewal(contract, thresholdDays)` ou `evaluatePriceChange(current, previous)` que devolve um objecto estruturado em vez de já formatar texto.

## Questões em Aberto

- **O ticket de F04 (`2026-09-15-coverage-check.md`) descrevia `coverage.tsx` como placeholder e os componentes como inexistentes — hoje ambos estão totalmente implementados**, incluindo o token `colors.success` que o ticket assinalava como ausente. O `status: backlog` no frontmatter desse ticket está desactualizado face ao código. Não é uma questão que bloqueie F05, mas confirma que o histórico de tickets pode estar à frente ou atrás do código real — verificar sempre o estado actual do repositório, não só os tickets, antes de planear.
- **Estrutura de `contracts`:** ainda não decidido se `documents` ganha uma coluna `contract_id` (paralelo a `asset_id`) ou se o agrupamento é feito só por `(user_id, provider)` sem nova FK. `CLAUDE.md` modela `contracts` como tabela independente com o seu próprio `current_amount`/`renewal_date`, o que sugere que `contracts` seria actualizado a cada novo documento correspondido (não apenas uma view sobre `documents`).
- **Critério de matching de `provider`:** nenhuma normalização existe hoje (nem trim/lowercase). Decidir em `/plan` entre (a) normalização simples client-side, (b) confirmação manual do utilizador ao detectar um `provider` semelhante mas não idêntico, ou (c) matching exacto simples (case-insensitive) aceitando que alguns pares não vão casar automaticamente na v1.
- **Onde vive o cálculo de matching/comparação:** client-side (TypeScript, em `src/lib/`) como todo o resto do motor de regras hoje, ou dentro de uma Edge Function/trigger SQL? Todo o `rulesEngine.ts` actual corre no cliente (React Native) — não há precedente de lógica de negóco em SQL (trigger/function Postgres) neste projecto além de `handle_new_user()`. Seguir o padrão existente sugere manter em `src/lib/`.
- **Ligação ao card "Upcoming renewals" do dashboard:** hoje atribuído a `TODO: F08` no código, mas é o local visual mais óbvio para o resultado de F05. Decidir no `/plan` se esta ficha já o liga.
- **Falta de testes automatizados:** não há framework de testes configurado no projecto (`package.json` não lista jest/vitest, `find` não encontrou nenhum `*.test.ts*`). `rulesEngine.ts` (incluindo as novas funções de F05) fica sem cobertura automática a menos que se introduza um test runner — fora do escopo desta pesquisa, mas relevante para `/plan` decidir se vale a pena introduzir testes unitários dado que este ficheiro é explicitamente "o motor de cálculo sempre determinístico" (`CLAUDE.md` regra #6) e por isso o mais crítico de validar.
