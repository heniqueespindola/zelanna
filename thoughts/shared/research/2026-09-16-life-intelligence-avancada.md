---
data: 2026-09-16
feature: "Life Intelligence Avançada (F13)"
status: completo
---

# Research: Life Intelligence Avançada (F13)

## Questão de Pesquisa

Da ficha `thoughts/shared/tickets/2026-09-16-life-intelligence-avancada.md` → `## Próximo passo`:

> Definir a heurística determinística para "unused subscription" dado que `contracts` não tem nenhum sinal de utilização/última cobrança/estado activo, decidir se "duplicate insurance" fica limitado a `coverage` com o mesmo `asset_id` (sem falsos positivos) ou se justifica um campo novo de categorização de risco para cobrir `contracts.type='insurance'` sem asset associado, e confirmar o limiar de valor de `assets.purchase_price` a usar em "protection gap".

Adicionalmente: mapear com exactidão (ficheiros, funções, schema) tudo o que já existe para as 6 sub-features pedidas (unused subscriptions, duplicate insurance, missing documentation, protection gaps, cost analysis consolidada, recomendações apresentadas como insights normais), para que `/plan` possa decidir sem re-explorar a codebase.

## Sumário

O motor de insights (tabela `insights`, `src/lib/rulesEngine.ts`, `src/lib/insights.ts`, ecrã `app/(dashboard)/alerts.tsx`) está implementado e em produção com 7 tipos de insight (F04–F08). F13 não precisa de nenhuma tabela, ecrã ou motor novo — precisa de: (1) novos valores em `InsightType`, (2) novas funções puras em `rulesEngine.ts`, (3) novas `generateXInsights()` em `insights.ts` seguindo o padrão de upsert idempotente já estabelecido, (4) entradas novas em `TYPE_LABELS` e possivelmente em `AlertsFilter`. Três das quatro deteções pedidas (unused subscription, duplicate insurance ao nível de `contracts`, missing documentation ao nível de `coverage`) não têm nenhum campo de schema que as suporte hoje sem heurísticas com falsos positivos ou sem uma coluna nova — este documento apresenta as opções encontradas na codebase/schema actual, sem decidir entre elas (decisão fica para `/plan`).

## Ficheiros Relevantes da Codebase

- `supabase/schema.sql:261-344` — tabela `insights`, colunas de scoping (`contract_id`, `bill_id`, `asset_id`, `coverage_type`, `resolved_at`), índices únicos `insights_coverage_gap_unique`/`insights_asset_scoped_unique`, RLS
- `supabase/schema.sql:228-238` — tabela `contracts` (sem `status`/`is_active`, sem campo de utilização)
- `supabase/schema.sql:104-113` — tabela `coverage` (sem `risk`/`category`)
- `supabase/schema.sql:69-102` — tabela `assets` (`purchase_price` como único proxy de valor)
- `supabase/schema.sql:36-49,225-226,258-259,320-324` — tabela `documents`, com FKs nullable `asset_id`, `contract_id`, `bill_id` (mas nenhuma para `coverage`)
- `supabase/schema.sql:290-300` — tabela `bills`
- `supabase/schema.sql:346-354` — tabela `events` (`source_id`+`type`, unique constraint `events_source_type_unique`) — usada pelo Life Calendar, não pelos insights
- `src/lib/rulesEngine.ts` (148 linhas) — motor determinístico central; ver `## Padrões de Implementação Existentes`
- `src/lib/insights.ts` (457 linhas) — geração/persistência de insights; contém `saveInsight`, `upsertCoverageGapInsight`, `upsertAssetScopedInsight`, e todas as `generateXInsights`
- `src/types/insights.ts` — `InsightType`, interfaces de `data` por tipo, `AlertsFilter`
- `src/lib/coverage.ts:18-52` — `fetchAssets`, `fetchCoverageForAsset`, `fetchCoverageForUser`, `fetchDocumentsWithoutAsset` (padrão directo para "missing documentation")
- `src/lib/contracts.ts` — `fetchContracts`, `normalizeProvider`, `matchDocumentToContract` (upsert de contrato por `provider_normalized`, guarda `previousAmount`)
- `src/lib/bills.ts` — `groupBills`, `calculateBillTotals`, `calculateCategoryTotals`, `filterBillsByPeriod` (agregação reutilizável para cost analysis)
- `src/lib/events.ts` — `fetchLifeCalendarEvents`, `syncAssetLifeEvents`, `syncRenewalEvents` — mostra o padrão de upsert com `onConflict: 'source_id,type'` para eventos derivados, análogo ao padrão de upsert em `insights.ts`
- `app/(dashboard)/alerts.tsx` — ecrã que chama as `generateXInsights` no `useFocusEffect`, depois `fetchAllInsights` + `fetchLifeCalendarEvents`; ponto de integração para as novas `generateXInsights` do F13
- `app/(dashboard)/bills.tsx` — ecrã que já consome `groupBills`/`calculateBillTotals`/`calculateCategoryTotals`; ponto de integração candidato para "cost analysis consolidada" (bills + contracts)
- `src/components/dashboard/InsightCard.tsx:6-14` — `TYPE_LABELS: Record<InsightType, string>`, tem de ser estendido para cada novo `InsightType`
- `src/components/dashboard/AlertsFilter.tsx` — `OPTIONS` array com os 4 buckets actuais (`all`/`coverage`/`bills`/`renewal`)

## Padrões de Implementação Existentes

### 1. Regra pura e determinística em `rulesEngine.ts`, sem I/O

```typescript
// src/lib/rulesEngine.ts:74-84
export function isSignificantIncrease(
  current: number,
  previous: number,
  thresholdPercent: number = 10
): boolean {
  return percentageChange(current, previous) > thresholdPercent;
}

export function isAnomaly(current: number, average: number, thresholdPercent: number = 25): boolean {
  return percentageChange(current, average) > thresholdPercent;
}
```

Cada regra é uma função pura testável isoladamente, com threshold como parâmetro opcional. Qualquer regra nova do F13 (ex: `isProtectionGapCandidate(asset, thresholdValue)`, `isDuplicateInsurance(coverageRecords)`) deve seguir este padrão — sem chamadas a `supabase` dentro de `rulesEngine.ts`.

### 2. `evaluateCoverage()` — já resolve "asset sem cobertura", reutilizável directamente para protection gap

```typescript
// src/lib/rulesEngine.ts:28-60
export interface CoverageEvaluation {
  primary: (CoverageRecord & { type: CoverageType; status: CoverageStatus }) | null;
  gaps: { type: 'warranty' | 'insurance'; reason: 'missing' | 'expired'; end_date: string | null }[];
}

export function evaluateCoverage(records: CoverageRecord[], thresholdDays: number = 30): CoverageEvaluation {
  // ... rank extension > insurance > warranty, filtra expirados, produz gaps para warranty/insurance
}
```

Já consumida por `generateCoverageGapInsights` (todo o asset, sem filtro de valor). Protection gap (F13) é, na prática, o mesmo `evaluateCoverage()` com um filtro adicional `asset.purchase_price >= threshold` antes de gerar o insight — não precisa de reimplementar a lógica de gaps.

### 3. Padrão de upsert idempotente para insights scoped por asset

```typescript
// src/lib/insights.ts:182-216
async function upsertAssetScopedInsight(params: {
  userId: string;
  assetId: string;
  type: 'coverage_expiring' | 'return_deadline';
  coverageType?: 'warranty' | 'insurance' | 'extension';
  severity: InsightSeverity;
  data: InsightData;
}): Promise<Insight> {
  // ...
  const onConflict = params.coverageType ? 'asset_id,type,coverage_type' : 'asset_id,type';
  const { data, error } = await supabase
    .from('insights')
    .upsert({ user_id: params.userId, asset_id: params.assetId, coverage_type: params.coverageType ?? null, type: params.type, severity: params.severity, data: params.data, message }, { onConflict })
    .select(INSIGHT_COLUMNS)
    .single();
  // ...
}
```

O `type` está tipado inline como union literal (`'coverage_expiring' | 'return_deadline'`) — para adicionar `'protection_gap'`/`'missing_documentation'` aqui, é preciso estender esta union E confirmar que o índice único `insights_asset_scoped_unique` (`asset_id, type` where `coverage_type is null`) cobre o novo tipo, ou criar um índice novo se o novo tipo precisar de outra chave de scoping (ex: `duplicate_insurance` pode precisar de scoping por par de `coverage_id`s, não só por `asset_id`).

### 4. Geração disparada no `useFocusEffect` do ecrã Alerts, nunca em background/cron

```typescript
// app/(dashboard)/alerts.tsx:28-41
const load = useCallback(async () => {
  if (!user) return;
  await Promise.all([
    generateCoverageGapInsights(user.id),
    generateCoverageExpiringInsights(user.id),
    generateReturnDeadlineInsights(user.id),
  ]);
  const [loadedInsights, loadedEvents] = await Promise.all([
    fetchAllInsights(user.id, { includeResolved: showResolved }),
    fetchLifeCalendarEvents(user.id),
  ]);
  setInsights(loadedInsights);
  setCalendarEntries(loadedEvents);
}, [user, showResolved]);
```

Cada `generateXInsights(userId)` novo do F13 entra neste `Promise.all`.

### 5. Agregação de custos já pronta em `bills.ts`, consumida por `bills.tsx`

```typescript
// src/lib/bills.ts:106-115
export function calculateCategoryTotals(groups: BillGroup[]): CategoryTotal[] {
  const map = new Map<BillCategory, number>();
  for (const group of groups) {
    const latest = group.bills[0];
    if (latest.amount === null) continue;
    const value = monthlyEquivalent(latest.amount, latest.billing_period);
    map.set(group.category, (map.get(group.category) ?? 0) + value);
  }
  return Array.from(map.entries()).map(([category, monthlyTotal]) => ({ category, monthlyTotal }));
}
```

Não existe hoje nenhuma função equivalente para `contracts` (ex: somar `current_amount` de contratos `type='subscription'`/`'insurance'` por categoria). "Cost analysis consolidada" (F13) precisa de uma função nova que combine `calculateCategoryTotals(groupBills(bills))` com uma agregação análoga sobre `contracts`, já que hoje são duas fontes de custo completamente desconexas — `bills.category` (`'water'|'electricity'|'gas'|'internet'|'mobile'|'landline'|'insurance'`) e `contracts.type` (`'insurance'|'utility'|'subscription'|'other'`) não partilham o mesmo vocabulário de categoria.

### 6. `fetchDocumentsWithoutAsset` — padrão directo para "missing documentation"

```typescript
// src/lib/coverage.ts:43-52
export async function fetchDocumentsWithoutAsset(userId: string): Promise<UploadedDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .is('asset_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load documents');
  return data ?? [];
}
```

Nota: esta função tem uma semântica ligeiramente diferente do que "missing documentation" do F13 precisa — encontra *documentos sem asset associado* (documento órfão), não *assets sem documento associado* (o inverso). Para F13, a query equivalente teria de partir de `assets`/`contracts` e verificar ausência de `documents` com `asset_id`/`contract_id` correspondente (ex: `assets` cujo `id` não aparece em nenhum `documents.asset_id`), ou usar `evaluateCoverage`'s gaps para "asset sem warranty" (que já é, na prática, "missing documentation" para warranty, visto que warranty entra via `coverage`, não via `documents` directamente).

## Tabelas/Queries Supabase Relevantes

| Tabela | Campos relevantes para F13 | Falta para F13 |
|---|---|---|
| `insights` | `type`, `severity`, `data jsonb`, `asset_id`, `contract_id`, `bill_id`, `coverage_type`, `resolved_at` | Possível índice único novo se um dos novos tipos precisar de scoping por par de registos (duplicate_insurance) |
| `contracts` | `id`, `provider`, `type`, `renewal_date`, `current_amount` | Nenhum sinal de utilização/estado activo para "unused subscription"; nenhum campo de categorização de risco para "duplicate insurance" sem `asset_id` |
| `coverage` | `asset_id`, `type`, `provider`, `start_date`, `end_date` | Nenhum campo `risk`/`category` para disambiguar duplicação de seguro sobre o mesmo risco vs. activos diferentes (embora `asset_id` já sirva para o caso mais simples) |
| `assets` | `purchase_price` (proxy de valor), `id` | Sem valor de mercado actual (decisão já tomada no F10 — usar `purchase_price`) |
| `documents` | `asset_id`, `contract_id`, `bill_id` (FKs nullable) | Sem FK para `coverage` — não há forma de ligar um documento a um registo de `coverage` específico |
| `bills` | `category`, `amount`, `billing_period` | Vocabulário de categoria (`BillCategory`) não coincide com `contracts.type` (`ContractType`) — nenhuma tabela/mapa une as duas para cost analysis consolidada |

Query de exemplo já existente para "registos órfãos" (padrão a generalizar):
```sql
-- equivalente ao que fetchDocumentsWithoutAsset faz via supabase-js
select * from documents where user_id = :userId and asset_id is null;
```

## APIs Externas Relevantes

Nenhuma. Todas as 6 sub-features do F13 (unused subscriptions, duplicate insurance, missing documentation, protection gaps, cost analysis, recomendações como insights) operam inteiramente sobre dados já persistidos em Supabase, com cálculo determinístico local (`rulesEngine.ts`) — não há extracção nova, não há chamada a Vision LLM, nem a Gmail API. A única chamada externa já existente e reutilizável é a edge function `explain-insight` (`src/lib/insights.ts:74-81`), invocada por `saveInsight`/`upsertXInsight` para gerar a `message` em linguagem natural a partir dos dados determinísticos — com fallback local (`fallbackMessage()`) se a chamada falhar. Os novos tipos do F13 devem seguir o mesmo padrão: `fallbackMessage()` estendido com um `case` por novo tipo, e a edge function `explain-insight` (fora deste repositório na perspetiva do código cliente) recebe `{ type, ...data }` e devolve `{ message }` — não foi possível confirmar nesta pesquisa o código da própria edge function (não está em `src/`; se existir, estará em `supabase/functions/explain-insight/`), pelo que `/plan` deve confirmar se essa function precisa de um prompt/case novo por tipo de insight adicionado.

## Code Snippets de Referência

Ver `## Padrões de Implementação Existentes` acima — todos os snippets citados (`isSignificantIncrease`/`isAnomaly`, `evaluateCoverage`, `upsertAssetScopedInsight`, `alerts.tsx` load(), `calculateCategoryTotals`, `fetchDocumentsWithoutAsset`) são os pontos de extensão directos para F13. Adicionalmente, o padrão de upsert com `onConflict` composto usado em `src/lib/events.ts:15-22` (`syncRenewalEvents`, `onConflict: 'source_id,type'`) é um segundo exemplo do mesmo padrão de idempotência aplicado a uma tabela diferente (`events`), útil como referência adicional caso `/plan` decida que algum insight do F13 precisa de uma chave de conflito não coberta pelos dois índices únicos já existentes em `insights`.

## Questões em Aberto

Estas são as três questões explicitamente pedidas em `## Próximo passo` da ficha — este documento apresenta as opções encontradas na codebase, a decisão fica para `/plan`:

1. **Heurística de "unused subscription"**: `contracts` não tem `status`/`last_charged`/`cancelled_at`. Opções observadas no schema actual:
   - (a) `type='subscription'` sem nenhum `document` ligado (`documents.contract_id is null`) nos últimos N meses — usa a FK já existente, mas confunde "sem fatura carregada" com "não utilizado" (falso positivo se o utilizador simplesmente não fez upload de facturas recentes)
   - (b) `type='subscription'` sem `asset`/`coverage` associado — só faz sentido para subscrições ligadas a um bem físico; não existe hoje nenhuma FK entre `contracts` e `assets`/`coverage`, pelo que esta opção implicaria adicionar uma relação nova
   - (c) adicionar campo novo a `contracts` (ex: `last_confirmed_at`, actualizado manualmente pelo utilizador) — muda o schema, fora do que existe hoje
   - Nenhuma destas é "sem falsos positivos"; `/plan` tem de escolher conscientemente o trade-off ou adiar esta sub-feature

2. **"Duplicate insurance" — `coverage` vs. `contracts`**: a única detecção sem ambiguidade com o schema actual é **duas `coverage` com o mesmo `asset_id` e `type='insurance'`** (mesmo risco, garantido pela FK). Duplicação ao nível de `contracts.type='insurance'` sem `asset_id` (seguros não ligados a um asset físico, ex: vida/saúde) não tem nenhum campo de categorização de risco — exigiria ou (a) uma coluna nova (`contracts.insurance_category`/`coverage.risk_category`) ou (b) ficar fora do escopo desta fase, limitando a detecção ao caso `coverage`+`asset_id`

3. **Limiar de valor para "protection gap"**: `assets.purchase_price` é o único proxy disponível (numeric, nullable). Não há nenhum threshold pré-existente no código para "asset de valor" — `/plan` tem de escolher entre um valor fixo (ex: >€500) ou um critério relativo (ex: top N% dos assets do utilizador por `purchase_price`); ambos são triviais de implementar como parâmetro de uma função pura em `rulesEngine.ts`, seguindo o padrão de threshold-como-parâmetro já usado em `isSignificantIncrease`/`isAnomaly`

Adicional, não pedido explicitamente mas descoberto durante a pesquisa:

4. **Edge function `explain-insight`**: não está neste repositório (`src/`) — `/plan` deve confirmar onde vive (`supabase/functions/explain-insight/`, fora do que foi lido nesta pesquisa) e se precisa de alteração para suportar os novos tipos, ou se o `fallbackMessage()` local chega para o MVP desta ficha.
5. **`InsightType` como union literal usada inline em `upsertAssetScopedInsight`** (`'coverage_expiring' | 'return_deadline'`, `src/lib/insights.ts:185`) — ao adicionar `protection_gap`/`missing_documentation` a esta função, é preciso decidir se passam a usar a mesma função (estendendo a union) ou se `duplicate_insurance`/`unused_subscription` (que não são necessariamente scoped por um único `asset_id`) precisam de uma função de upsert distinta com uma chave de conflito diferente.
