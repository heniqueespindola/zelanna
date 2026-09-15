---
data: 2026-09-15
feature: "Bills Intelligence (F06)"
status: completo
---

# Research: Bills Intelligence (F06)

## Questão de Pesquisa

Do ticket `thoughts/shared/tickets/2026-09-15-bills-intelligence.md` → "Próximo passo":

> Deve a categoria de bill (água, eletricidade, gás, internet, telemóvel, telefone, seguro) ser extraída pelo Vision LLM como uma extensão do schema de `extract-document` (paralelo a `document_type`), ou inferida em runtime por uma regra determinística sobre `provider`/`document_type`? E que estrutura mínima liga `bills` a `documents` e a `insights` (colunas `bill_id`) sem duplicar o padrão já validado por `contracts`/`contract_id` em F05?

Em torno disto, documentar: (a) tudo o que já existe no código para categorização, histórico, comparação e alertas de faturas; (b) o padrão exacto já usado em F05 para matching de fornecedor, cálculo determinístico e explicação por LLM, para ser reutilizado sem duplicação; (c) onde é que o fluxo actual de upload de documentos já toca em lógica de "utility"/faturas recorrentes, para perceber onde é que F06 se encaixa sem colidir com F05.

## Sumário

F04 (Coverage Check) e F05 (Renewal/Price Increase Detection) já estão implementados. O motor de regras determinístico (`percentageChange`, `isSignificantIncrease` a 10%, `isAnomaly` a 25%, `average`) já cobre exactamente as duas regras de alerta pedidas para Bills Intelligence, e o padrão completo de insight (cálculo → `explain-insight` edge function → fallback determinístico → persistir em `insights`) já existe e é reutilizável tal como está. **Falta por completo:** (1) qualquer noção de categoria de bill em qualquer camada (extracção, schema, UI); (2) a tabela `bills`; (3) uma ligação entre `bills` e `insights` (hoje `insights.contract_id` só aponta para `contracts`). Um achado importante: **hoje, todas as faturas (`document_type='invoice'`) já são automaticamente tratadas como `contracts.type='utility'`** pelo matching de F05 (`src/lib/contracts.ts:12-17`), e já geram insights `price_increase` comparando cada fatura só com a fatura imediatamente anterior do mesmo fornecedor — **sem histórico de 6/12 meses nem detecção de anomalia**. Isto significa que F06 não parte de uma folha em branco: tem de decidir como coexistir com este fluxo já activo, para não gerar dois insights de "aumento" duplicados (um do F05 via `contracts`, outro do F06 via `bills`) para a mesma fatura.

## Ficheiros Relevantes da Codebase

- [supabase/schema.sql](supabase/schema.sql) — schema completo aplicado. Tabelas actuais: `users`, `documents` (linha 36), `assets` (69), `coverage` (100), `contracts` (144), `insights` (177). **Não existe `bills`.**
- [src/lib/rulesEngine.ts](src/lib/rulesEngine.ts) — motor de cálculo determinístico. `percentageChange` (linha 61), `isSignificantIncrease` (65, default 10%), `isAnomaly` (73, default 25%), `average` (77), `daysUntil`/`isExpiringSoon` (4, 10). Reutilizável directamente para Bills Intelligence sem alterações.
- [src/lib/insights.ts](src/lib/insights.ts) — padrão completo de geração de insight para F05: `saveInsight` (37), `explainInsight` (25, chama a edge function), `fallbackMessage` (16), `generateInsightsForContract` (67, aplica os thresholds e persiste). Único ponto de acesso a `insights` no cliente.
- [src/lib/contracts.ts](src/lib/contracts.ts) — matching de documento a contrato por fornecedor normalizado: `normalizeProvider` (8), `mapDocumentTypeToContractType` (12, mapeia `'invoice'` → `'utility'`), `matchDocumentToContract` (45, upsert em `contracts` por `provider_normalized`, sempre substitui `current_amount` pelo valor mais recente — **não guarda histórico**).
- [src/lib/extraction.ts](src/lib/extraction.ts) — `uploadDocument` (10), `extractDocument` (29, invoca a edge function `extract-document`), `saveDocument` (45, insere em `documents`), `discardDocument` (74).
- [src/components/documents/DocumentPreviewForm.tsx](src/components/documents/DocumentPreviewForm.tsx) — **ponto de integração central**. `handleConfirm` (linha 31) guarda o documento e depois chama `matchDocumentToContract` + `generateInsightsForContract` (58-77) em modo best-effort (erros não bloqueiam o utilizador, só fazem `console.error`). É aqui que uma chamada equivalente para bills (categorização + histórico + insight) teria de ser adicionada.
- [src/components/documents/DocumentTypeSelector.tsx](src/components/documents/DocumentTypeSelector.tsx) — selector de chips para `document_type`, com opções fixas hardcoded (10-16). Padrão a replicar para um eventual selector de categoria de bill.
- [src/components/coverage/AssetCategorySelector.tsx](src/components/coverage/AssetCategorySelector.tsx) — selector de chips para `AssetCategory`, estrutura idêntica ao `DocumentTypeSelector`. Confirma que este é o padrão de UI estabelecido para qualquer campo de categoria fechado (enum) no projecto.
- [src/components/dashboard/InsightCard.tsx](src/components/dashboard/InsightCard.tsx) — renderiza um insight no dashboard. **Linha 13**: o label do `Badge` é um ternário `insight.type === 'price_increase' ? 'Price increase' : 'Renewal'` — não é exaustivo; qualquer novo `type` (ex: `'anomaly'`) cairia no ramo `'Renewal'` por omissão.
- [app/(dashboard)/index.tsx](app/(dashboard)/index.tsx) — dashboard principal. Lê `fetchUpcomingRenewals`/`fetchRecentInsights` de `src/lib/insights.ts` (linha 6) e renderiza com `RenewalTimeline`/`InsightCard`. Qualquer insight novo inserido na tabela `insights` aparece aqui automaticamente, sem alterações a este ficheiro — desde que `InsightCard.tsx` saiba rotulá-lo (ver ponto acima).
- [app/(dashboard)/coverage.tsx](app/(dashboard)/coverage.tsx) — exemplo de ecrã completo (fetch via `useFocusEffect` + composição de componentes) mais próximo do que `bills.tsx` precisa de se tornar.
- [app/(dashboard)/bills.tsx](app/(dashboard)/bills.tsx) — placeholder puro, sem nenhuma leitura de dados; comentário `TODO: F06/F07` (linha 12) já reserva esta ficha (F06 = histórico, F07 = Bills Dashboard/gráficos).
- [supabase/functions/extract-document/index.ts](supabase/functions/extract-document/index.ts) — edge function de extracção Vision LLM. `ExtractedDocumentData` (8) e `EXTRACTION_SYSTEM_PROMPT` (16) só têm `document_type`/`provider`/`date`/`amount`/`expiry_date` — **sem nenhum campo de categoria**. Usa `model: 'claude-sonnet-5'` (94).
- [supabase/functions/explain-insight/index.ts](supabase/functions/explain-insight/index.ts) — edge function de explicação em linguagem natural. `RequestBody` (linha 19) é uma union discriminada estrita `PriceIncreaseBody | RenewalBody` — **não aceita hoje nenhum outro `type`**; adicionar um insight `'anomaly'` exige estender esta union e o prompt (`EXPLAIN_SYSTEM_PROMPT`, linha 21, que hoje só tem instruções para `"price_increase"` e `"renewal"`).
- [src/types/documents.ts](src/types/documents.ts) — `DocumentType`, `ExtractedDocumentData`, `UploadedDocument`. Sem campo de categoria.
- [src/types/contracts.ts](src/types/contracts.ts) — `ContractType = 'insurance' | 'utility' | 'subscription' | 'other'`, `Contract`. `'utility'` é um bucket único, sem sub-categoria.
- [src/types/insights.ts](src/types/insights.ts) — `InsightType = 'price_increase' | 'renewal'` (linha 3), `Insight.contract_id: string | null` (22) — sem `bill_id`.
- [src/types/assets.ts](src/types/assets.ts) — `AssetCategory = 'electronics' | 'vehicle' | 'appliance' | 'other'`. Exemplo do padrão de union type "fechado" usado para categorias no projecto.

## Padrões de Implementação Existentes

**1. Fluxo "extracção → preview editável → confirmação → matching best-effort → insight" (F05, já em produção):**

```
DocumentUpload → extractDocument (edge function)
  → DocumentPreviewForm (utilizador confirma/edita document_type, provider, amount, datas)
    → saveDocument() [documents]
    → matchDocumentToContract() [upsert em contracts por provider_normalized]
    → generateInsightsForContract() [calcula com rulesEngine, guarda em insights]
```

O matching e a geração de insight correm depois do `saveDocument`, dentro de um `try/catch` que **não bloqueia** o utilizador se falharem (`src/components/documents/DocumentPreviewForm.tsx:58-77`).

**2. Padrão de insight (cálculo determinístico + explicação LLM com fallback), `src/lib/insights.ts`:**

```ts
// 1. calcula com rulesEngine.ts (nunca no LLM)
const changePercent = percentageChange(current, previous);
if (isSignificantIncrease(current, previous, threshold)) { ... }

// 2. tenta explicar via edge function, cai para template determinístico se falhar
async function explainInsight(type, data) {
  const { data: result, error } = await supabase.functions.invoke('explain-insight', { body: { type, ...data } });
  if (error || !result?.message) throw new Error('Explanation failed');
  return result.message;
}
// chamada sempre dentro de try/catch com fallbackMessage(type, data) como fallback
```

**3. Padrão de matching por fornecedor normalizado (`contracts`, F05):** coluna gerada em SQL (`provider_normalized text generated always as (lower(trim(provider))) stored`, `supabase/schema.sql:148`) + lookup exacto (`src/lib/contracts.ts:29-38`). Sem fuzzy matching.

**4. Padrão de selector de categoria fechada (chips):** `DocumentTypeSelector.tsx` e `AssetCategorySelector.tsx` são estruturalmente idênticos — array `OPTIONS: {value, label}[]` + `Pressable` chips + estado controlado pelo formulário pai. Qualquer categoria nova de bill seguiria este mesmo padrão.

**5. Padrão de ecrã com fetch por `useFocusEffect`:** `app/(dashboard)/coverage.tsx` e `app/(dashboard)/index.tsx` chamam funções `fetch*` de `src/lib/*.ts` dentro de `useFocusEffect(useCallback(...))`, nunca directamente com `supabase` no componente.

## Tabelas/Queries Supabase Relevantes

**Tabelas existentes (aplicadas):** `users`, `documents` (com `asset_id`, `contract_id` adicionados via `alter table` nas linhas 142 e 175), `assets`, `coverage`, `contracts` (com `provider_normalized` gerado), `insights` (com `contract_id`, sem `bill_id`).

**Não existe `bills`.** `CLAUDE.md` já define a forma alvo (secção "Schema da base de dados"):
```sql
bills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  category text,     -- 'agua' | 'eletricidade' | 'gas' | 'internet' | 'telemovel' | 'telefone' | 'seguro'
  invoice_date date,
  billing_period text,
  amount numeric,
  created_at timestamptz DEFAULT now()
)
```

**Queries existentes relevantes para o padrão de histórico/comparação que F06 precisa de replicar:**
- `fetchUpcomingRenewals` (`src/lib/insights.ts:123`) — `select` com `.not('renewal_date', 'is', null).order('renewal_date', { ascending: true })`, depois filtro em memória com `isExpiringSoon`.
- `findContractByProvider` (`src/lib/contracts.ts:29`) — `select().eq('user_id', userId).eq('provider_normalized', providerNormalized).maybeSingle()`.
- Nenhuma query existente faz agregação temporal (médias móveis, agrupamento por mês) — isso não existe ainda em lado nenhum do código, incluindo Coverage/Renewal.

**RLS:** todas as tabelas seguem `auth.uid() = user_id` directo, excepto `coverage` que verifica via `exists (select 1 from assets where ...)` porque não tem `user_id` próprio. Uma tabela `bills` com `user_id` directo seguiria o padrão simples (igual a `documents`/`contracts`/`insights`).

## APIs Externas Relevantes

- **Anthropic Messages API** (`https://api.anthropic.com/v1/messages`), chamada directamente por `fetch` em ambas as edge functions, modelo `claude-sonnet-5`, `anthropic-version: '2023-06-01'`. `extract-document` usa `max_tokens: 1024` e conteúdo multimodal (`image`/`document` com `base64`); `explain-insight` usa `max_tokens: 256` e só texto.
- Chaves via `Deno.env.get('ANTHROPIC_API_KEY')` — nunca no cliente, consistente com `CLAUDE.md` regra #5.
- Nenhuma API de gráficos/visualização integrada (sem `victory`, `recharts`, `react-native-svg`-based charts) — `react-native-svg` está instalado (`package.json`) mas não há nenhum uso de gráfico no código actual; isto é consistente com gráficos serem F07, não F06.
- Sem Gmail API nem nenhuma integração de email — confirmado, Fase 2 ainda não começou.

## Code Snippets de Referência

**Mapeamento actual `document_type` → `contract.type` (o ponto onde `'invoice'` já vira `'utility'` hoje):**
```ts
// src/lib/contracts.ts:12-17
export function mapDocumentTypeToContractType(docType: DocumentType | null): ContractType | null {
  if (docType === 'insurance') return 'insurance';
  if (docType === 'invoice') return 'utility';
  if (docType === 'contract') return 'subscription';
  return null;
}
```

**Persistência de insight, já genérica para `contract_id` (mostra a forma exacta a estender para `bill_id`):**
```ts
// src/lib/insights.ts:51-64
const { data, error } = await supabase
  .from('insights')
  .insert({
    user_id: params.userId,
    contract_id: params.contractId,
    type: params.type,
    severity: params.severity,
    data: params.data,
    message,
  })
  .select(INSIGHT_COLUMNS)
  .single();
```

**Rotulagem de insight no dashboard, não exaustiva (relevante para qualquer novo `InsightType`):**
```ts
// src/components/dashboard/InsightCard.tsx:13
<Badge label={insight.type === 'price_increase' ? 'Price increase' : 'Renewal'} tone={insight.severity} />
```

## Questões em Aberto

1. **Coexistência com o fluxo F05 já activo.** Hoje, ao confirmar qualquer documento com `document_type='invoice'`, `matchDocumentToContract` já corre, já actualiza `contracts.current_amount` e já pode gerar um insight `'price_increase'` (comparação só com a fatura anterior, sem média de 6/12 meses). Se F06 adicionar uma segunda pipeline paralela (via `bills`) para as mesmas faturas de utility, é preciso decidir se ambas continuam a correr (risco de dois insights de "aumento" para a mesma fatura, com números possivelmente diferentes porque usam bases de comparação diferentes) ou se o comportamento de F05 para `document_type='invoice'` passa a ser substituído/absorvido pelo novo fluxo de `bills`. Isto não estava documentado no ticket e só ficou visível ao ler `src/lib/contracts.ts` e `DocumentPreviewForm.tsx` em conjunto.
2. **Origem da categoria.** Confirmado: não existe hoje nenhum dado de categoria em nenhuma camada (extracção, schema, tipos, UI). As duas opções identificadas no ticket continuam válidas e sem decisão tomada: extensão do schema de `extract-document` (paralelo a `document_type`) vs. inferência determinística por keywords sobre `provider`. Research não decide isto — fica para `/plan`.
3. **Estrutura de ligação `bills` ↔ `documents` ↔ `insights`.** Confirmado que o padrão já existente (`documents.contract_id`, `insights.contract_id`, ambos `nullable`, `on delete set null`/`cascade`) é directamente replicável como `documents.bill_id` e `insights.bill_id`. Não há nenhum obstáculo técnico identificado a fazer isto da mesma forma — é a opção de menor risco por já estar validada em produção por F05.
4. **`explain-insight` precisa de ser estendido para um novo `type` (`'anomaly'`).** A union discriminada `RequestBody` (`supabase/functions/explain-insight/index.ts:19`) e o `EXPLAIN_SYSTEM_PROMPT` (linha 21) só cobrem `'price_increase'`/`'renewal'` hoje. Isto é trabalho concreto a fazer em `/plan`/`/implement`, não uma decisão em aberto — mas fica documentado porque não estava explícito no ticket original.
5. **`InsightCard.tsx` precisa de ser actualizado** para rotular correctamente qualquer novo `InsightType` (hoje o ternário na linha 13 assume só dois tipos possíveis) — mesma observação que o ponto anterior, é trabalho concreto identificado pela pesquisa.
6. **Periodicidade (`billing_period`).** Nenhuma tabela ou lógica actual lida com periodicidade de facturação (mensal vs. anual/bimestral). Continua sem resposta — o ticket já assinalava isto como decisão de `/plan`.
