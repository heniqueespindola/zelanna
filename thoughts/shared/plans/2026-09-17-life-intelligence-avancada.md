---
data: 2026-09-17
feature: "Life Intelligence Avançada (F13)"
research: "thoughts/shared/research/2026-09-16-life-intelligence-avancada.md"
status: completo
---

# Spec: Life Intelligence Avançada (F13)

## Visão Geral

Estende o motor de insights já existente (`rulesEngine.ts` + `insights.ts` + `app/(dashboard)/alerts.tsx`) com 4 novos tipos determinísticos — `unused_subscription`, `duplicate_insurance`, `missing_documentation`, `protection_gap` — e adiciona uma vista de cost analysis consolidada (bills + contracts) a `app/(dashboard)/bills.tsx`. Não cria tabela, ecrã nem motor novo.

## Decisões tomadas (heurísticas, ver `## Questões em Aberto` do research)

1. **Unused subscription:** `contracts.type='subscription'` sem documento associado há mais de **12 meses** (`documents.contract_id`, data de referência = data do documento mais recente ligado ao contrato, ou `contract.start_date` se nunca houve documento). Severidade `info` — é heurística, sujeita a falso positivo.
2. **Duplicate insurance:** limitado a **duas ou mais `coverage` em vigor com `type='insurance'` no mesmo `asset_id`**. Sem novo campo de schema. Não cobre seguros a nível de `contracts` sem `asset_id`.
3. **Protection gap:** limiar fixo **`purchase_price >= €500`**, combinado com `evaluateCoverage().primary === null` (activo sem nenhuma cobertura em vigor, de qualquer tipo).
4. **Missing documentation:** duas variantes, ambas por *ausência total de documento* (não por ausência de `coverage`, para não duplicar `coverage_gap`):
   - Asset sem nenhum `documents.asset_id` ligado.
   - Contract sem nenhum `documents.contract_id` ligado (qualquer `contracts.type`, não só subscriptions).
   - Sem novo campo `documents.coverage_id`.

## Ficheiros a Modificar

### `supabase/schema.sql`

**Modificações** (adicionar no final do ficheiro, seguindo o padrão incremental `alter table` / `create index if not exists` já usado):

- [ ] Novo índice único parcial para idempotência dos insights **scoped por `contract_id`** (só para os tipos novos que são gerados em loop no focus do ecrã — `price_increase`/`renewal` continuam a acumular histórico via `saveInsight`, sem upsert, por isso o índice tem de ser filtrado por `type` para não os afectar):

```sql
create unique index if not exists insights_contract_scoped_unique
  on public.insights (contract_id, type)
  where contract_id is not null and type in ('unused_subscription', 'missing_documentation');
```

- Não é preciso nenhum índice novo para os tipos scoped por `asset_id` (`duplicate_insurance`, `protection_gap`, `missing_documentation` variante asset) — todos reaproveitam o índice já existente `insights_asset_scoped_unique` (`asset_id, type` where `asset_id is not null and coverage_type is null`), pelo mesmo mecanismo que `return_deadline` já usa hoje.
- Não é preciso nenhuma coluna nova (`risk_category`, `coverage_id`, `status`) — decisão tomada acima.

**Critério de sucesso:** reaplicar `schema.sql` no projecto Supabase não falha (idempotente).

---

### `src/types/insights.ts`

**Modificações:**

```typescript
export type InsightType =
  | 'price_increase'
  | 'renewal'
  | 'anomaly'
  | 'recurring_increase'
  | 'coverage_gap'
  | 'coverage_expiring'
  | 'return_deadline'
  | 'unused_subscription'
  | 'duplicate_insurance'
  | 'missing_documentation'
  | 'protection_gap';
```

- [ ] Adicionar 4 novas interfaces de `data`, seguindo o padrão das existentes:

```typescript
export interface UnusedSubscriptionInsightData {
  provider: string;
  monthsSinceLastDocument: number;
  thresholdMonths: number;
}

export interface DuplicateInsuranceInsightData {
  assetName: string;
  providers: (string | null)[];
  count: number;
}

export interface MissingDocumentationInsightData {
  subjectType: 'asset' | 'contract';
  subjectName: string;
}

export interface ProtectionGapInsightData {
  assetName: string;
  purchasePrice: number;
  thresholdValue: number;
}
```

- [ ] Estender `InsightData` union com as 4 novas interfaces.
- [ ] Estender `AlertsFilter`:

```typescript
export type AlertsFilter = 'all' | 'coverage' | 'bills' | 'renewal' | 'subscriptions';
```

**Critério de sucesso:** `tsc --noEmit` passa.

---

### `src/lib/rulesEngine.ts`

**Modificações** — adicionar no final do ficheiro, funções puras, sem `supabase` import, seguindo o padrão de `isSignificantIncrease`/`isAnomaly`:

```typescript
export function monthsSince(dateISO: string, from: Date = new Date()): number {
  return -daysUntil(dateISO, from) / 30.44;
}

export function isUnusedSubscription(
  referenceDateISO: string | null,
  thresholdMonths: number = 12,
  from: Date = new Date()
): boolean {
  if (!referenceDateISO) return false;
  return monthsSince(referenceDateISO, from) >= thresholdMonths;
}

export function findDuplicateCoverage(
  records: CoverageRecord[],
  type: CoverageType,
  thresholdDays: number = 30
): (CoverageRecord & { type: CoverageType })[] {
  const inForce = records
    .filter((r): r is CoverageRecord & { type: CoverageType } => r.type === type)
    .filter((r) => getCoverageStatus(r.end_date, thresholdDays) !== 'expired');
  return inForce.length >= 2 ? inForce : [];
}

export function isProtectionGapCandidate(
  purchasePrice: number | null,
  thresholdValue: number = 500
): boolean {
  return purchasePrice !== null && purchasePrice >= thresholdValue;
}
```

**Critério de sucesso:** `tsc --noEmit` passa; cada função é pura (sem I/O), testável com inputs literais.

---

### `src/lib/coverage.ts`

**Modificações:**

- [ ] Adicionar novo fetcher, ao lado de `fetchDocumentsWithoutAsset`:

```typescript
export async function fetchAssetIdsWithDocuments(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('documents')
    .select('asset_id')
    .eq('user_id', userId)
    .not('asset_id', 'is', null);
  if (error) throw new Error('Could not load asset documents');
  return new Set((data ?? []).map((d) => d.asset_id as string));
}
```

**Critério de sucesso:** `tsc --noEmit` passa.

---

### `src/lib/contracts.ts`

**Modificações:**

- [ ] Adicionar fetcher batch (evita N+1 queries — uma query só, reduzida em JS para um `Map`):

```typescript
export async function fetchLatestDocumentDateByContract(userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('documents')
    .select('contract_id, date, created_at')
    .eq('user_id', userId)
    .not('contract_id', 'is', null)
    .order('date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load contract documents');
  const map = new Map<string, string>();
  for (const doc of data ?? []) {
    const contractId = doc.contract_id as string;
    if (map.has(contractId)) continue;
    map.set(contractId, (doc.date as string | null) ?? (doc.created_at as string));
  }
  return map;
}
```

- [ ] Adicionar tipo e função de agregação de custos, para a cost analysis consolidada (ver secção própria abaixo):

```typescript
export interface ContractCategoryTotal {
  type: ContractType;
  monthlyTotal: number;
}

export function calculateContractCategoryTotals(contracts: Contract[]): ContractCategoryTotal[] {
  const map = new Map<ContractType, number>();
  for (const contract of contracts) {
    if (!contract.type || contract.current_amount === null) continue;
    map.set(contract.type, (map.get(contract.type) ?? 0) + contract.current_amount);
  }
  return Array.from(map.entries()).map(([type, monthlyTotal]) => ({ type, monthlyTotal }));
}
```

**Nota:** `contracts` não tem `billing_period` (ao contrário de `bills`) — `current_amount` é somado tal como está, sem conversão mensal/anual. Limitação de schema conhecida, não resolvida nesta ficha.

**Critério de sucesso:** `tsc --noEmit` passa.

---

### `src/lib/insights.ts`

**Modificações:**

- [ ] Novos imports no topo: `findDuplicateCoverage`, `isProtectionGapCandidate`, `isUnusedSubscription`, `monthsSince` de `@/lib/rulesEngine`; `fetchContracts`, `fetchLatestDocumentDateByContract` de `@/lib/contracts`; `fetchAssetIdsWithDocuments` de `@/lib/coverage`; os 4 novos tipos de `@/types/insights`.

- [ ] Novas constantes (junto de `RENEWAL_THRESHOLD_DAYS` etc.):

```typescript
const UNUSED_SUBSCRIPTION_THRESHOLD_MONTHS = 12;
const PROTECTION_GAP_VALUE_THRESHOLD = 500;
```

- [ ] Estender `fallbackMessage()` com 4 novos `if` (antes do `return` final):

```typescript
if (type === 'unused_subscription') {
  const d = data as UnusedSubscriptionInsightData;
  return `${d.provider}: no invoice uploaded in over ${Math.floor(d.monthsSinceLastDocument)} months — this subscription may not be in use.`;
}
if (type === 'duplicate_insurance') {
  const d = data as DuplicateInsuranceInsightData;
  return `${d.assetName}: ${d.count} active insurance policies found on this asset — you may be paying for duplicate coverage.`;
}
if (type === 'missing_documentation') {
  const d = data as MissingDocumentationInsightData;
  return d.subjectType === 'asset'
    ? `${d.subjectName}: no document on file for this asset.`
    : `${d.subjectName}: no document on file for this contract.`;
}
if (type === 'protection_gap') {
  const d = data as ProtectionGapInsightData;
  return `${d.assetName}: worth over €${d.thresholdValue}, but has no active coverage.`;
}
```

- [ ] Estender a union `type` inline de `upsertAssetScopedInsight` (linha ~185):

```typescript
type: 'coverage_expiring' | 'return_deadline' | 'duplicate_insurance' | 'missing_documentation' | 'protection_gap';
```

- [ ] Nova função privada `upsertContractScopedInsight`, espelho de `upsertAssetScopedInsight` mas para `contract_id`:

```typescript
async function upsertContractScopedInsight(params: {
  userId: string;
  contractId: string;
  type: 'unused_subscription' | 'missing_documentation';
  severity: InsightSeverity;
  data: InsightData;
}): Promise<Insight> {
  let message: string;
  try {
    message = await explainInsight(params.type, params.data);
  } catch {
    message = fallbackMessage(params.type, params.data);
  }
  const { data, error } = await supabase
    .from('insights')
    .upsert(
      {
        user_id: params.userId,
        contract_id: params.contractId,
        type: params.type,
        severity: params.severity,
        data: params.data,
        message,
      },
      { onConflict: 'contract_id,type' }
    )
    .select(INSIGHT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save ${params.type} insight`);
  return data;
}
```

- [ ] Nova função pública `generateUnusedSubscriptionInsights`:

```typescript
export async function generateUnusedSubscriptionInsights(userId: string): Promise<Insight[]> {
  const [contracts, latestDocByContract] = await Promise.all([
    fetchContracts(userId),
    fetchLatestDocumentDateByContract(userId),
  ]);
  const created: Insight[] = [];
  for (const contract of contracts) {
    if (contract.type !== 'subscription') continue;
    const referenceDate = latestDocByContract.get(contract.id) ?? contract.start_date;
    if (!isUnusedSubscription(referenceDate, UNUSED_SUBSCRIPTION_THRESHOLD_MONTHS)) continue;
    const data: UnusedSubscriptionInsightData = {
      provider: contract.provider,
      monthsSinceLastDocument: Math.floor(monthsSince(referenceDate as string)),
      thresholdMonths: UNUSED_SUBSCRIPTION_THRESHOLD_MONTHS,
    };
    created.push(
      await upsertContractScopedInsight({
        userId,
        contractId: contract.id,
        type: 'unused_subscription',
        severity: 'info',
        data,
      })
    );
  }
  return created;
}
```

- [ ] Nova função pública `generateDuplicateInsuranceInsights` (reaproveita o mesmo padrão de agrupamento `coverageByAsset` já usado em `generateCoverageGapInsights`/`generateCoverageExpiringInsights`):

```typescript
export async function generateDuplicateInsuranceInsights(userId: string): Promise<Insight[]> {
  const [assets, coverage] = await Promise.all([fetchAssets(userId), fetchCoverageForUser()]);
  if (assets.length === 0) return [];

  const coverageByAsset = new Map<string, CoverageRecord[]>();
  for (const record of coverage) {
    const list = coverageByAsset.get(record.asset_id) ?? [];
    list.push(record);
    coverageByAsset.set(record.asset_id, list);
  }

  const created: Insight[] = [];
  for (const asset of assets) {
    const duplicates = findDuplicateCoverage(coverageByAsset.get(asset.id) ?? [], 'insurance');
    if (duplicates.length < 2) continue;
    const data: DuplicateInsuranceInsightData = {
      assetName: asset.name,
      providers: duplicates.map((d) => d.provider),
      count: duplicates.length,
    };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'duplicate_insurance',
        severity: 'warning',
        data,
      })
    );
  }
  return created;
}
```

- [ ] Nova função pública `generateMissingDocumentationInsights` (duas variantes num só loop combinado):

```typescript
export async function generateMissingDocumentationInsights(userId: string): Promise<Insight[]> {
  const [assets, contracts, assetIdsWithDocs, latestDocByContract] = await Promise.all([
    fetchAssets(userId),
    fetchContracts(userId),
    fetchAssetIdsWithDocuments(userId),
    fetchLatestDocumentDateByContract(userId),
  ]);

  const created: Insight[] = [];

  for (const asset of assets) {
    if (assetIdsWithDocs.has(asset.id)) continue;
    const data: MissingDocumentationInsightData = { subjectType: 'asset', subjectName: asset.name };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'missing_documentation',
        severity: 'info',
        data,
      })
    );
  }

  for (const contract of contracts) {
    if (latestDocByContract.has(contract.id)) continue;
    const data: MissingDocumentationInsightData = { subjectType: 'contract', subjectName: contract.provider };
    created.push(
      await upsertContractScopedInsight({
        userId,
        contractId: contract.id,
        type: 'missing_documentation',
        severity: 'info',
        data,
      })
    );
  }

  return created;
}
```

- [ ] Nova função pública `generateProtectionGapInsights`:

```typescript
export async function generateProtectionGapInsights(userId: string): Promise<Insight[]> {
  const [assets, coverage] = await Promise.all([fetchAssets(userId), fetchCoverageForUser()]);
  if (assets.length === 0) return [];

  const coverageByAsset = new Map<string, CoverageRecord[]>();
  for (const record of coverage) {
    const list = coverageByAsset.get(record.asset_id) ?? [];
    list.push(record);
    coverageByAsset.set(record.asset_id, list);
  }

  const created: Insight[] = [];
  for (const asset of assets) {
    if (!isProtectionGapCandidate(asset.purchase_price, PROTECTION_GAP_VALUE_THRESHOLD)) continue;
    const { primary } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
    if (primary) continue;
    const data: ProtectionGapInsightData = {
      assetName: asset.name,
      purchasePrice: asset.purchase_price as number,
      thresholdValue: PROTECTION_GAP_VALUE_THRESHOLD,
    };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'protection_gap',
        severity: 'warning',
        data,
      })
    );
  }
  return created;
}
```

- [ ] Estender `filterInsightsByBucket`:

```typescript
export function filterInsightsByBucket(insights: Insight[], filter: AlertsFilter): Insight[] {
  if (filter === 'all') return insights;
  if (filter === 'coverage')
    return insights.filter(
      (i) =>
        i.type === 'coverage_gap' ||
        i.type === 'coverage_expiring' ||
        i.type === 'return_deadline' ||
        i.type === 'duplicate_insurance' ||
        i.type === 'protection_gap' ||
        i.type === 'missing_documentation'
    );
  if (filter === 'bills') return insights.filter((i) => i.bill_id !== null);
  if (filter === 'subscriptions') return insights.filter((i) => i.type === 'unused_subscription');
  return insights.filter((i) => i.type === 'renewal');
}
```

**Critério de sucesso:** `tsc --noEmit` passa; cada `generateX` é idempotente (chamar duas vezes seguidas não duplica linhas em `insights`).

---

### `supabase/functions/explain-insight/index.ts`

**Modificações:**

- [ ] Adicionar 4 novas interfaces de body, espelhando as existentes:

```typescript
interface UnusedSubscriptionBody {
  type: 'unused_subscription';
  provider: string;
  monthsSinceLastDocument: number;
  thresholdMonths: number;
}

interface DuplicateInsuranceBody {
  type: 'duplicate_insurance';
  assetName: string;
  providers: (string | null)[];
  count: number;
}

interface MissingDocumentationBody {
  type: 'missing_documentation';
  subjectType: 'asset' | 'contract';
  subjectName: string;
}

interface ProtectionGapBody {
  type: 'protection_gap';
  assetName: string;
  purchasePrice: number;
  thresholdValue: number;
}
```

- [ ] Estender `RequestBody` union com as 4 novas interfaces.
- [ ] Estender `EXPLAIN_SYSTEM_PROMPT` com 4 novas linhas `For "X":`, antes da linha `Tone:`:

```
For "unused_subscription": state the provider and that no invoice has been uploaded in over the given number of months, suggesting the subscription may be unused — never state this as certain.
For "duplicate_insurance": state the asset name and that more than one active insurance policy was found on it, using the exact count given.
For "missing_documentation": state the subject name and that no document is on file for it (an asset or a contract, per subjectType).
For "protection_gap": state the asset name and that it has no active coverage despite being above the given value threshold, using the exact numbers given.
```

**Critério de sucesso:** `tsc --noEmit` (Deno/edge functions não correm no `tsc --noEmit` do projecto Expo — validar apenas visualmente a sintaxe TS). Deploy manual necessário: `supabase functions deploy explain-insight` (fora do âmbito automático de `git commit`/CI deste repo).

**Nota de segurança:** se a função não for redeployada, `explainInsight()` falha (edge function antiga não reconhece o novo `type`) e `saveInsight`/`upsertXInsight` já têm `catch` para `fallbackMessage()` local — a app continua funcional sem a explicação LLM. Não é um bloqueador para as fases anteriores.

---

### `src/components/dashboard/InsightCard.tsx`

**Modificações:**

- [ ] Estender `TYPE_LABELS`:

```typescript
const TYPE_LABELS: Record<InsightType, string> = {
  price_increase: 'Price increase',
  renewal: 'Renewal',
  anomaly: 'Anomaly',
  recurring_increase: 'Recurring increase',
  coverage_gap: 'Coverage gap',
  coverage_expiring: 'Coverage expiring',
  return_deadline: 'Return deadline',
  unused_subscription: 'Unused subscription',
  duplicate_insurance: 'Duplicate insurance',
  missing_documentation: 'Missing documentation',
  protection_gap: 'Protection gap',
};
```

**Critério de sucesso:** `tsc --noEmit` passa (o `Record<InsightType, string>` obriga a incluir todos os tipos — se faltar um, o build falha).

---

### `src/components/dashboard/AlertsFilter.tsx`

**Modificações:**

```typescript
const OPTIONS: { value: AlertsFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'bills', label: 'Bills' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'subscriptions', label: 'Subscriptions' },
];
```

**Critério de sucesso:** `tsc --noEmit` passa; ecrã Alerts mostra o novo chip "Subscriptions".

---

### `app/(dashboard)/alerts.tsx`

**Modificações:**

- [ ] Adicionar aos imports de `@/lib/insights`: `generateUnusedSubscriptionInsights`, `generateDuplicateInsuranceInsights`, `generateMissingDocumentationInsights`, `generateProtectionGapInsights`.
- [ ] Estender o `Promise.all` dentro de `load()`:

```typescript
await Promise.all([
  generateCoverageGapInsights(user.id),
  generateCoverageExpiringInsights(user.id),
  generateReturnDeadlineInsights(user.id),
  generateUnusedSubscriptionInsights(user.id),
  generateDuplicateInsuranceInsights(user.id),
  generateMissingDocumentationInsights(user.id),
  generateProtectionGapInsights(user.id),
]);
```

**Critério de sucesso:** `tsc --noEmit` passa; abrir o ecrã Alerts gera os novos insights sem erro na consola.

---

## Cost Analysis Consolidada

**Decisão de âmbito:** `bills.category` e `contracts.type` não partilham vocabulário — em vez de forçar uma taxonomia nova (fora do pedido desta ficha), a vista mostra duas secções lado a lado (bills por `BillCategory`, já existente; contracts por `ContractType`, nova) mais um total combinado mensal. Sem filtro de período para contracts — `contracts` não tem série temporal equivalente a `bills.invoice_date`/`billing_period` (limitação de schema conhecida).

**Local:** extensão de `app/(dashboard)/bills.tsx` (não um ecrã novo), reaproveitando `calculateContractCategoryTotals` (`src/lib/contracts.ts`, ver acima) ao lado de `calculateCategoryTotals`/`calculateBillTotals` já existentes.

### `src/components/bills/ContractCostSummaryCard.tsx` (novo ficheiro)

**Propósito:** mostrar o breakdown de custos de `contracts` por `type`, mais o total combinado (bills + contracts).

**Conteúdo:**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { ContractCategoryTotal } from '@/lib/contracts';

const TYPE_LABELS: Record<string, string> = {
  insurance: 'Insurance',
  utility: 'Utility',
  subscription: 'Subscription',
  other: 'Other',
};

interface Props {
  totals: ContractCategoryTotal[];
  combinedMonthlyTotal: number;
}

export function ContractCostSummaryCard({ totals, combinedMonthlyTotal }: Props) {
  if (totals.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Contracts & subscriptions (monthly)</Text>
      {totals.map((t) => (
        <View key={t.type} style={styles.row}>
          <Text style={styles.label}>{TYPE_LABELS[t.type] ?? t.type}</Text>
          <Text style={styles.value}>€{t.monthlyTotal.toFixed(2)}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Combined total (bills + contracts)</Text>
        <Text style={styles.totalValue}>€{combinedMonthlyTotal.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: fonts.body, color: colors.border },
  value: { fontFamily: fonts.body, color: colors.white },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  totalLabel: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  totalValue: { fontFamily: fonts.body, fontWeight: '700', color: colors.accent, fontSize: 16 },
});
```

### `app/(dashboard)/bills.tsx`

**Modificações:**

- [ ] Import `fetchContracts`, `calculateContractCategoryTotals` de `@/lib/contracts`; `ContractCostSummaryCard` de `@/components/bills/ContractCostSummaryCard`; `type { Contract }` de `@/types/contracts`.
- [ ] Novo estado `const [contracts, setContracts] = useState<Contract[] | null>(null);`
- [ ] Estender o `Promise.all` do `useFocusEffect` para incluir `fetchContracts(user.id)`, e `setContracts(loadedContracts)`.
- [ ] Estender a condição de loading: `if (bills === null || insights === null || renewals === null || contracts === null)`.
- [ ] Novo `useMemo`:

```typescript
const contractCategoryTotals = useMemo(
  () => (contracts ? calculateContractCategoryTotals(contracts) : []),
  [contracts]
);
const combinedMonthlyTotal = useMemo(
  () => totals.monthlyTotal + contractCategoryTotals.reduce((sum, t) => sum + t.monthlyTotal, 0),
  [totals, contractCategoryTotals]
);
```

- [ ] Renderizar `<ContractCostSummaryCard totals={contractCategoryTotals} combinedMonthlyTotal={combinedMonthlyTotal} />` logo a seguir a `<BillsSummaryCard ... />`.

**Critério de sucesso:** `tsc --noEmit` passa; ecrã Bills mostra o novo cartão quando o utilizador tem `contracts` com `current_amount` preenchido.

---

## Fases de Implementação

### Fase 1: Schema + tipos — base para tudo o resto
**Ficheiros:**
- Modificar `supabase/schema.sql` (novo índice)
- Modificar `src/types/insights.ts` (novo `InsightType`, `InsightData`, `AlertsFilter`)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa
- [ ] Reaplicar `schema.sql` no Supabase local/staging sem erro

**Critérios de sucesso (manuais):**
- [ ] Confirmar no Supabase Studio que `insights_contract_scoped_unique` foi criado

### Fase 2: Motor de regras puro
**Ficheiros:**
- Modificar `src/lib/rulesEngine.ts` (4 novas funções puras)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa

**Critérios de sucesso (manuais):**
- [ ] N/A (sem I/O — validado por inspecção/uso na Fase 4)

### Fase 3: Fetchers batch
**Ficheiros:**
- Modificar `src/lib/coverage.ts` (`fetchAssetIdsWithDocuments`)
- Modificar `src/lib/contracts.ts` (`fetchLatestDocumentDateByContract`, `calculateContractCategoryTotals`)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa

**Critérios de sucesso (manuais):**
- [ ] Confirmar em Supabase Studio (SQL editor) que as queries equivalentes devolvem os dados esperados para um utilizador de teste

### Fase 4: Geração de insights
**Ficheiros:**
- Modificar `src/lib/insights.ts` (4 novas `generateXInsights`, `upsertContractScopedInsight`, `fallbackMessage`, `filterInsightsByBucket`)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa

**Critérios de sucesso (manuais):**
- [ ] Com dados de teste (1 asset caro sem cobertura, 1 asset com 2 seguros activos, 1 subscription sem documento há >12 meses, 1 asset/contract sem nenhum documento), chamar cada `generateXInsights` (via ecrã Alerts) e confirmar as 4 linhas em `insights`
- [ ] Reabrir o ecrã Alerts uma segunda vez e confirmar que **não** duplica linhas (upsert idempotente)

### Fase 5: Edge function
**Ficheiros:**
- Modificar `supabase/functions/explain-insight/index.ts`

**Critérios de sucesso (automáticos):**
- [ ] Nenhum (fora do `tsc --noEmit` do projecto Expo)

**Critérios de sucesso (manuais):**
- [ ] `supabase functions deploy explain-insight`
- [ ] Confirmar que `message` dos novos insights vem da explicação LLM (não do fallback) após o deploy

### Fase 6: UI — Alerts
**Ficheiros:**
- Modificar `src/components/dashboard/InsightCard.tsx`
- Modificar `src/components/dashboard/AlertsFilter.tsx`
- Modificar `app/(dashboard)/alerts.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa
- [ ] `expo lint` passa

**Critérios de sucesso (manuais):**
- [ ] No simulador, abrir Alerts e confirmar que os 4 novos tipos aparecem com label e mensagem correctos
- [ ] Filtrar por "Coverage" e confirmar que inclui `duplicate_insurance`/`protection_gap`/`missing_documentation`
- [ ] Filtrar por "Subscriptions" e confirmar que só mostra `unused_subscription`
- [ ] Resolver um dos novos insights e confirmar que desaparece da lista

### Fase 7: UI — Cost analysis consolidada
**Ficheiros:**
- Criar `src/components/bills/ContractCostSummaryCard.tsx`
- Modificar `src/lib/contracts.ts` (já coberto na Fase 3)
- Modificar `app/(dashboard)/bills.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa
- [ ] `expo lint` passa

**Critérios de sucesso (manuais):**
- [ ] No simulador, abrir Bills com pelo menos 1 contract com `current_amount` preenchido e confirmar que o novo cartão aparece com o breakdown por tipo e o total combinado correcto (bills + contracts)
- [ ] Sem nenhum contract com `current_amount`, confirmar que o cartão não aparece (retorna `null`)

## Estratégia de Testes

- **Unit:** não existe suite de testes neste repositório (confirmado — nenhum `*.test.ts`/`*.test.tsx`); consistente com as restantes fichas já implementadas. Não introduzir framework de testes nesta ficha.
- **Manual:** ver critérios de sucesso manuais por fase acima. Preparar dados de teste no Supabase (via app ou SQL editor):
  - 1 `asset` com `purchase_price = 800`, sem nenhuma `coverage` → deve gerar `protection_gap`
  - 1 `asset` com 2 `coverage` `type='insurance'`, `end_date` no futuro → deve gerar `duplicate_insurance`
  - 1 `contract` `type='subscription'`, `start_date` há 13 meses, sem nenhum `document` ligado → deve gerar `unused_subscription` e `missing_documentation`
  - 1 `asset` sem nenhum `document` ligado (independente de `coverage`) → deve gerar `missing_documentation`
  - 1 `contract` `type='insurance'` com `current_amount = 45` → deve aparecer em `ContractCostSummaryCard`

## Notas de Implementação

- **Regra #6 do `CLAUDE.md` respeitada em todo o lado:** todas as heurísticas (`isUnusedSubscription`, `findDuplicateCoverage`, `isProtectionGapCandidate`) são funções puras em `rulesEngine.ts`; o LLM (`explain-insight`) só recebe os números já calculados e explica, nunca calcula.
- **`missing_documentation` (asset) é intencionalmente independente de `coverage_gap`:** um asset pode ter `coverage_gap` (sem warranty/insurance) e `missing_documentation` (sem nenhum documento) ao mesmo tempo, ou só um dos dois (ex: cobertura introduzida manualmente sem upload do PDF → só `missing_documentation`). Isto é intencional, não um bug de insights duplicados.
- **`unused_subscription` e `missing_documentation` (contract) podem coexistir** para a mesma subscription sem nenhum documento — o primeiro é sobre "há quanto tempo não há upload" (heurística de uso), o segundo é sobre "nunca houve nenhum documento" (heurística de completude). Mensagens diferentes, não redundantes.
- **Índice `insights_contract_scoped_unique` é filtrado por `type`** propositadamente — não pode ser um índice único geral em `(contract_id, type)` porque `price_increase`/`renewal` (já existentes) acumulam várias linhas por `contract_id` ao longo do tempo (histórico de eventos), enquanto os tipos novos desta ficha são estado (idempotentes, um por `contract_id`+`type`). Confirmar antes de aplicar em produção que não há já duplicados de `unused_subscription`/`missing_documentation` para o mesmo `contract_id` (não deve haver, são tipos novos).
- **Bucket `'coverage'` do `AlertsFilter` agora agrega 6 tipos** (`coverage_gap`, `coverage_expiring`, `return_deadline`, `duplicate_insurance`, `protection_gap`, `missing_documentation`) — decisão de UX tomada nesta spec (não pedida explicitamente pelo research), reversível trivialmente se o utilizador achar o bucket demasiado genérico ao testar.
- **Cost analysis consolidada não unifica taxonomia** `BillCategory`/`ContractType` — mostra os dois breakdowns lado a lado mais um total combinado. Unificar a taxonomia (ex: mapear `contracts.type='utility'` para as categorias de `bills`) fica fora do âmbito desta ficha; reavaliar se o utilizador achar confuso na Phase 0/validação.
- **`explain-insight` precisa de deploy manual** (`supabase functions deploy explain-insight`) — não acontece automaticamente com o `git commit`/push deste repo. Até ao deploy, os novos insights usam sempre `fallbackMessage()` (comportamento seguro, já teste pelo padrão `try/catch` existente).

## Referências

- Research: `thoughts/shared/research/2026-09-16-life-intelligence-avancada.md`
- Ficha: `thoughts/shared/tickets/2026-09-16-life-intelligence-avancada.md`
- Padrão de upsert idempotente scoped por asset: `src/lib/insights.ts:182-216` (`upsertAssetScopedInsight`)
- Padrão de evaluateCoverage reaproveitado: `src/lib/rulesEngine.ts:33-60`
- Padrão de agregação de custos: `src/lib/bills.ts:106-115` (`calculateCategoryTotals`)
- Padrão de fetcher "sem X associado": `src/lib/coverage.ts:43-52` (`fetchDocumentsWithoutAsset`)
