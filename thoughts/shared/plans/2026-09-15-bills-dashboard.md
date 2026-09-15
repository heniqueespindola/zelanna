---
data: 2026-09-15
feature: "Bills Dashboard (F07)"
research: "thoughts/shared/research/2026-09-15-bills-dashboard.md"
status: aguarda_implementacao
---

# Spec: Bills Dashboard (F07)

## Visão Geral

Adiciona uma secção visual agregada ao ecrã `bills.tsx` existente (totais mensal/anual, gráfico de custo por categoria, gráfico de evolução mensal por fornecedor, secção de anomalias/aumentos recorrentes, lista de próximas renovações e filtro de período), reutilizando 100% os cálculos já validados em F06 (`groupBills`, `percentageChange`, `isSignificantIncrease`, `isAnomaly`, `average`) e acrescentando apenas o que ainda não existe: normalização de `billing_period`, a nova regra determinística de "aumento recorrente", a tabela `events` e a biblioteca de gráficos.

## Decisões tomadas (resolvendo as questões em aberto do research)

1. **Biblioteca de gráficos:** `react-native-gifted-charts` (SVG-based sobre `react-native-svg`, já instalado) — funciona em Expo Go, sem dev build/EAS. Instalar via `npx expo install` para garantir a versão compatível com Expo SDK 57.
2. **Origem das renovações:** criar a tabela `events` agora, conforme `CLAUDE.md`, mas com âmbito estrito: só é sincronizado o `type: 'renewal'` a partir de `contracts.renewal_date`, e só para contratos `type: 'insurance' | 'utility'` (os relevantes para bills). A sincronização acontece em runtime (`syncRenewalEvents`, chamada quando o Bills Dashboard carrega), não há job de background nem trigger na base de dados.
   ⚠️ **Nota de scope a validar:** o ticket lista em "Fora do escopo" — *"Criação de eventos automáticos na tabela events... esta ficha só lê/apresenta, não escreve novos eventos"*. Esta spec **escreve** eventos (`type: 'renewal'` a partir de `contracts`), porque sem isso a tabela fica vazia e a lista de renovações não tem de onde ler. A leitura desta spec é que essa nota do ticket se refere à criação automática mais ampla de eventos para o Life Calendar (expiry/deadline a partir de warranties/assets — isso continua reservado para F08), não a bloquear a única escrita necessária para a funcionalidade pedida aqui. Confirmar esta interpretação antes de `/implement`.
3. **Critério de "aumento recorrente":** 3 meses consecutivos com subida (cada valor maior que o anterior, qualquer magnitude acima de 0%) — `isRecurringIncrease(amountsDesc, 3)` em `rulesEngine.ts`. Persiste como novo `InsightType` `'recurring_increase'`, seguindo o mesmo padrão de `price_increase`/`anomaly` (cálculo determinístico + mensagem via `explain-insight`/`fallbackMessage`), para que o Bills Dashboard possa "reutilizar o texto já gerado" tal como pedido no ticket.
4. **Normalização de `billing_period`:** `yearly` → `amount/12` (mensal) e `amount` (anual); `bimonthly` → `amount/2` (mensal) e `amount*6` (anual); `monthly` ou `null` → `amount` (mensal) e `amount*12` (anual) — assume `monthly` por omissão quando `billing_period` é `null`.
5. **Filtro de período:** aplicado em memória sobre `fetchBills()` (já carrega todo o histórico do utilizador), como janela rolante a partir de "agora" (`month`/`quarter`/`year`/`all`), não mês de calendário. Afecta **apenas** a nova secção de totais/gráficos (`filteredGroups`); a lista "crua" de `BillGroupCard` mais abaixo continua a usar `groupBills(bills)` sem filtro, e `average6`/`average12`/anomalias/aumento recorrente continuam a ser calculados sobre o histórico completo no momento do upload (`generateInsightsForBill`, inalterado nesta ficha) — o filtro nunca afecta esses cálculos já persistidos.
6. **Localização:** nova secção no `app/(dashboard)/bills.tsx` actual, acima da lista de `BillGroupCard` já existente (F06). Sem ecrã novo, sem rota nova.

## Ficheiros a Criar

### `src/types/events.ts`
**Propósito:** Tipos de domínio para a tabela `events`, seguindo o padrão de `src/types/contracts.ts`.
**Conteúdo:**
```ts
export type EventType = 'renewal' | 'expiry' | 'deadline';

export interface LifeEvent {
  id: string;
  user_id: string;
  type: EventType;
  due_date: string | null;
  source_id: string | null;
  created_at: string;
}
```

### `src/lib/events.ts`
**Propósito:** Sincroniza e lê eventos de renovação relevantes para bills (contratos `insurance`/`utility`), sem tocar em `coverage`/`assets` (fora do âmbito desta ficha).
**Conteúdo:**
```ts
import { supabase } from '@/lib/supabase';
import { isExpiringSoon } from '@/lib/rulesEngine';
import { fetchContracts } from '@/lib/contracts';
import { RENEWAL_THRESHOLD_DAYS } from '@/lib/insights';
import type { Contract } from '@/types/contracts';
import type { LifeEvent } from '@/types/events';

const EVENT_COLUMNS = 'id, user_id, type, due_date, source_id, created_at';
const BILLS_RELEVANT_CONTRACT_TYPES = ['insurance', 'utility'] as const;

export async function syncRenewalEvents(userId: string, contracts: Contract[]): Promise<void> {
  const rows = contracts
    .filter((c) => c.renewal_date !== null)
    .map((c) => ({ user_id: userId, type: 'renewal' as const, due_date: c.renewal_date, source_id: c.id }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('events').upsert(rows, { onConflict: 'source_id,type' });
  if (error) throw new Error('Could not sync renewal events');
}

export async function fetchUpcomingEvents(userId: string): Promise<LifeEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('user_id', userId)
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true });
  if (error) throw new Error('Could not load events');
  return (data ?? []).filter((e) => e.due_date && isExpiringSoon(e.due_date, RENEWAL_THRESHOLD_DAYS));
}

export interface UpcomingBillRenewal {
  event: LifeEvent;
  contract: Contract;
}

export async function fetchUpcomingBillRenewals(userId: string): Promise<UpcomingBillRenewal[]> {
  const contracts = (await fetchContracts(userId)).filter((c) =>
    c.type !== null && (BILLS_RELEVANT_CONTRACT_TYPES as readonly string[]).includes(c.type)
  );
  await syncRenewalEvents(userId, contracts);
  const events = await fetchUpcomingEvents(userId);
  const contractsById = new Map(contracts.map((c) => [c.id, c]));
  return events
    .filter((e) => e.type === 'renewal' && e.source_id !== null && contractsById.has(e.source_id))
    .map((e) => ({ event: e, contract: contractsById.get(e.source_id as string) as Contract }));
}
```

### `src/components/ui/ChipRow.tsx`
**Propósito:** Selector de chips genérico, extraído do padrão já usado em `BillCategorySelector.tsx`/`BillingPeriodSelector.tsx` — reutilizado pelos dois novos selectors desta ficha (período, categoria/fornecedor no gráfico de evolução). Não modifica os selectors existentes de F06.
**Conteúdo:**
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ChipRow<T>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.label}
            style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipUnselected: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  chipText: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
  chipTextSelected: { fontWeight: '700' },
});
```

### `src/components/bills/PeriodFilter.tsx`
**Propósito:** Chips de filtro de período (mês/trimestre/ano/tudo).
**Conteúdo:**
```tsx
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { ChipRow } from '@/components/ui/ChipRow';
import type { BillPeriodFilter } from '@/types/bills';

interface Props {
  value: BillPeriodFilter;
  onChange: (value: BillPeriodFilter) => void;
}

const OPTIONS: { value: BillPeriodFilter; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export function PeriodFilter({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Period</Text>
      <ChipRow options={OPTIONS} value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
});
```

### `src/components/bills/BillsSummaryCard.tsx`
**Propósito:** Mostra o total mensal e anual estimados (já normalizados por `billing_period`).
**Conteúdo:**
```tsx
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

interface Props {
  monthlyTotal: number;
  annualTotal: number;
}

export function BillsSummaryCard({ monthlyTotal, annualTotal }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Estimated monthly</Text>
        <Text style={styles.value}>€{monthlyTotal.toFixed(2)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Estimated annual</Text>
        <Text style={styles.value}>€{annualTotal.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: fonts.body, color: colors.border },
  value: { fontFamily: fonts.body, fontWeight: '700', color: colors.white, fontSize: 18 },
});
```

### `src/components/bills/CategoryBreakdownChart.tsx`
**Propósito:** Gráfico de barras de custo mensal por categoria, usando `colors.primary`.
**Conteúdo:**
```tsx
import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { colors, fonts, spacing } from '@/constants/theme';
import type { CategoryTotal } from '@/lib/bills';

const CATEGORY_LABELS: Record<string, string> = {
  water: 'Water',
  electricity: 'Electricity',
  gas: 'Gas',
  internet: 'Internet',
  mobile: 'Mobile',
  landline: 'Landline',
  insurance: 'Insurance',
};

interface Props {
  totals: CategoryTotal[];
}

export function CategoryBreakdownChart({ totals }: Props) {
  if (totals.length === 0) {
    return <Text style={styles.empty}>No bills in this period yet.</Text>;
  }

  const data = totals.map((t) => ({
    value: t.monthlyTotal,
    label: CATEGORY_LABELS[t.category] ?? t.category,
    frontColor: colors.primary,
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cost by category (monthly)</Text>
      <BarChart
        data={data}
        barWidth={28}
        spacing={20}
        noOfSections={4}
        yAxisTextStyle={{ color: colors.border }}
        xAxisLabelTextStyle={{ color: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  empty: { fontFamily: fonts.body, color: colors.border },
});
```
**Nota:** confirmar as props exactas de `BarChart` na versão instalada (`node_modules/react-native-gifted-charts`) — a API pública (`data`, `barWidth`, `spacing`, `frontColor` por item, `noOfSections`) é estável entre versões recentes, mas validar antes de assumir mais props.

### `src/components/bills/BillEvolutionChart.tsx`
**Propósito:** Gráfico de linha da evolução mensal, com selectors de categoria e fornecedor (drill-down pedido no ticket).
**Conteúdo:**
```tsx
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { colors, fonts, spacing } from '@/constants/theme';
import { ChipRow } from '@/components/ui/ChipRow';
import type { BillGroup } from '@/lib/bills';
import type { BillCategory } from '@/types/bills';

const CATEGORY_LABELS: Record<string, string> = {
  water: 'Water', electricity: 'Electricity', gas: 'Gas', internet: 'Internet',
  mobile: 'Mobile', landline: 'Landline', insurance: 'Insurance',
};

interface Props {
  groups: BillGroup[];
}

export function BillEvolutionChart({ groups }: Props) {
  const categories = useMemo(() => Array.from(new Set(groups.map((g) => g.category))), [groups]);
  const [category, setCategory] = useState<BillCategory | null>(categories[0] ?? null);
  const providersInCategory = useMemo(
    () => groups.filter((g) => g.category === category),
    [groups, category]
  );
  const [provider, setProvider] = useState<string | null>(null);

  if (categories.length === 0) {
    return <Text style={styles.empty}>No bills yet to chart.</Text>;
  }

  const selectedGroup =
    providersInCategory.find((g) => g.provider === provider) ?? providersInCategory[0];
  const series = selectedGroup
    ? [...selectedGroup.bills]
        .filter((b) => b.amount !== null && b.invoice_date !== null)
        .reverse()
        .map((b) => ({ value: b.amount as number, label: (b.invoice_date as string).slice(5) }))
    : [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Monthly evolution</Text>
      <ChipRow
        options={categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))}
        value={category as BillCategory}
        onChange={(c) => { setCategory(c); setProvider(null); }}
      />
      <ChipRow
        options={providersInCategory.map((g) => ({ value: g.provider, label: g.provider }))}
        value={selectedGroup?.provider ?? ''}
        onChange={setProvider}
      />
      {series.length < 2 ? (
        <Text style={styles.empty}>Not enough history for this provider yet.</Text>
      ) : (
        <LineChart
          data={series}
          color={colors.primary}
          thickness={2}
          yAxisTextStyle={{ color: colors.border }}
          xAxisLabelTextStyle={{ color: colors.border }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  empty: { fontFamily: fonts.body, color: colors.border },
});
```

### `src/components/bills/BillsAlertsSection.tsx`
**Propósito:** Secção dedicada de anomalias/aumentos (recorrentes ou não), reutilizando `InsightCard` (que já colore por `severity` via `Badge`, `warning`/`critical` = tons dourado/vermelho do tema) — nunca recalcula nem reformula a mensagem.
**Conteúdo:**
```tsx
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { InsightCard } from '@/components/dashboard/InsightCard';
import type { Insight } from '@/types/insights';

interface Props {
  insights: Insight[];
}

export function BillsAlertsSection({ insights }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Anomalies and recurring increases</Text>
      {insights.length === 0 ? (
        <Text style={styles.empty}>No anomalies or recurring increases detected yet.</Text>
      ) : (
        insights.map((insight) => <InsightCard key={insight.id} insight={insight} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  empty: { fontFamily: fonts.body, color: colors.border },
});
```

## Ficheiros a Modificar

### `supabase/schema.sql`
**Modificações:**
- [ ] No fim do ficheiro (depois da secção `bills`, linha 240), adicionar:
```sql
create table if not exists public.events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  type text not null,           -- 'renewal' | 'expiry' | 'deadline'
  due_date date,
  source_id uuid,               -- referência a contracts/coverage/assets
  created_at timestamptz not null default now(),
  constraint events_source_type_unique unique (source_id, type)
);

alter table public.events enable row level security;

create policy "Users can view own events"
  on public.events for select
  using (auth.uid() = user_id);

create policy "Users can insert own events"
  on public.events for insert
  with check (auth.uid() = user_id);

create policy "Users can update own events"
  on public.events for update
  using (auth.uid() = user_id);

create policy "Users can delete own events"
  on public.events for delete
  using (auth.uid() = user_id);
```
- [ ] Aplicar manualmente no projecto Supabase (SQL editor ou `supabase db push`), mesmo processo já usado em F04/F05/F06.
- [ ] A constraint `events_source_type_unique` é o que torna `upsert(..., { onConflict: 'source_id,type' })` em `src/lib/events.ts` idempotente — sem ela o upsert falha.

### `src/lib/rulesEngine.ts`
**Modificações:**
- [ ] Linha 1, adicionar import: `import type { BillingPeriod } from '@/types/bills';`
- [ ] Depois de `average` (linha 77-79), adicionar:
```ts
export function monthlyEquivalent(amount: number, billingPeriod: BillingPeriod | null): number {
  if (billingPeriod === 'yearly') return amount / 12;
  if (billingPeriod === 'bimonthly') return amount / 2;
  return amount; // 'monthly' ou null assume mensal
}

export function annualEquivalent(amount: number, billingPeriod: BillingPeriod | null): number {
  if (billingPeriod === 'yearly') return amount;
  if (billingPeriod === 'bimonthly') return amount * 6;
  return amount * 12; // 'monthly' ou null assume mensal
}

export function isRecurringIncrease(amountsDesc: number[], consecutivePeriods: number = 3): boolean {
  if (amountsDesc.length < consecutivePeriods) return false;
  for (let i = 0; i < consecutivePeriods - 1; i++) {
    if (amountsDesc[i] <= amountsDesc[i + 1]) return false;
  }
  return true;
}
```
- [ ] `amountsDesc` segue a mesma convenção já usada em `group.bills`/`fetchBillHistory` (mais recente primeiro); a função verifica se cada um dos `consecutivePeriods` valores mais recentes é estritamente maior que o seguinte (mês anterior).

### `src/types/bills.ts`
**Modificações:**
- [ ] Depois de `BillingPeriod` (linha 10), adicionar: `export type BillPeriodFilter = 'month' | 'quarter' | 'year' | 'all';`

### `src/lib/bills.ts`
**Modificações:**
- [ ] Linha 3, import: `import { average, percentageChange, monthlyEquivalent, annualEquivalent } from '@/lib/rulesEngine';`
- [ ] Linha 4, import: `import type { Bill, BillCategory, BillingPeriod, BillPeriodFilter } from '@/types/bills';`
- [ ] Depois de `groupBills` (linha 87), adicionar:
```ts
export function calculateBillTotals(groups: BillGroup[]): { monthlyTotal: number; annualTotal: number } {
  let monthlyTotal = 0;
  let annualTotal = 0;
  for (const group of groups) {
    const latest = group.bills[0];
    if (latest.amount === null) continue;
    monthlyTotal += monthlyEquivalent(latest.amount, latest.billing_period);
    annualTotal += annualEquivalent(latest.amount, latest.billing_period);
  }
  return { monthlyTotal, annualTotal };
}

export interface CategoryTotal {
  category: BillCategory;
  monthlyTotal: number;
}

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

export function filterBillsByPeriod(bills: Bill[], period: BillPeriodFilter, now: Date = new Date()): Bill[] {
  if (period === 'all') return bills;
  const rangeStart = new Date(now);
  if (period === 'month') rangeStart.setMonth(rangeStart.getMonth() - 1);
  else if (period === 'quarter') rangeStart.setMonth(rangeStart.getMonth() - 3);
  else rangeStart.setFullYear(rangeStart.getFullYear() - 1);
  return bills.filter((b) => {
    if (!b.invoice_date) return false;
    const invoiceDate = new Date(b.invoice_date);
    return invoiceDate >= rangeStart && invoiceDate <= now;
  });
}
```

### `src/types/insights.ts`
**Modificações:**
- [ ] Linha 3: `export type InsightType = 'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase';`
- [ ] Depois de `AnomalyInsightData` (linha 19-27), adicionar:
```ts
export interface RecurringIncreaseInsightData {
  provider: string;
  category: string | null;
  monthsConsecutive: number;
  amounts: number[]; // mais recente primeiro, length = monthsConsecutive
}
```
- [ ] Em `Insight` (linha 29-39): actualizar `data: PriceIncreaseInsightData | RenewalInsightData | AnomalyInsightData | RecurringIncreaseInsightData;`

### `src/lib/insights.ts`
**Modificações:**
- [ ] Linha 2-10, imports: adicionar `isRecurringIncrease` a par de `isAnomaly`; adicionar `RecurringIncreaseInsightData` aos imports de `@/types/insights`.
- [ ] Linha 24: mudar `const RENEWAL_THRESHOLD_DAYS = 30;` para `export const RENEWAL_THRESHOLD_DAYS = 30;` (necessário para `src/lib/events.ts`).
- [ ] Linha 26, adicionar: `const RECURRING_INCREASE_PERIODS = 3;`
- [ ] `fallbackMessage` (linha 28-42): estender assinatura de `data` para incluir `RecurringIncreaseInsightData`; adicionar ramo:
```ts
if (type === 'recurring_increase') {
  const d = data as RecurringIncreaseInsightData;
  return `${d.provider}: price has increased for ${d.monthsConsecutive} consecutive billing periods.`;
}
```
- [ ] `explainInsight` (linha 44-54): estender assinatura de `data` para incluir `RecurringIncreaseInsightData`.
- [ ] `saveInsight` (linha 56-86): estender assinatura de `data` para incluir `RecurringIncreaseInsightData`.
- [ ] `generateInsightsForBill` (linha 134-183): depois do bloco de `anomaly` (linha 162-180), adicionar:
```ts
const recentAmounts = [bill.amount, ...priorBills.map((b) => b.amount)].filter(
  (a): a is number => a !== null
);
if (isRecurringIncrease(recentAmounts, RECURRING_INCREASE_PERIODS)) {
  const data: RecurringIncreaseInsightData = {
    provider: bill.provider,
    category: bill.category,
    monthsConsecutive: RECURRING_INCREASE_PERIODS,
    amounts: recentAmounts.slice(0, RECURRING_INCREASE_PERIODS),
  };
  created.push(
    await saveInsight({ userId, billId: bill.id, type: 'recurring_increase', severity: 'warning', data })
  );
}
```
- [ ] Depois de `fetchRecentInsights` (linha 185-194), adicionar:
```ts
export async function fetchBillInsights(userId: string, limit: number = 10): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('insights')
    .select(INSIGHT_COLUMNS)
    .eq('user_id', userId)
    .not('bill_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Could not load bill insights');
  return data ?? [];
}
```
- [ ] **Nota:** `recentAmounts` reaproveita `bill.amount` (o próprio) + `priorBills` (já filtrado/ordenado desc por `fetchBillHistory` dentro de `generateInsightsForBill`, ver linha 143-145) — não requer nova query.

### `supabase/functions/explain-insight/index.ts`
**Modificações:**
- [ ] Linha 19-28, depois de `AnomalyBody`, adicionar:
```ts
interface RecurringIncreaseBody {
  type: 'recurring_increase';
  provider: string;
  category: string | null;
  monthsConsecutive: number;
  amounts: number[];
}
```
- [ ] Linha 30: `type RequestBody = PriceIncreaseBody | RenewalBody | AnomalyBody | RecurringIncreaseBody;`
- [ ] Linha 32-38 (`EXPLAIN_SYSTEM_PROMPT`), adicionar instrução:
```
For "recurring_increase": state the provider (and category, if given) and that the price has increased for the given number of consecutive billing periods, using the exact number given.
```
- [ ] Deploy da function (`supabase functions deploy explain-insight`) — fora do alcance de `/implement` local, documentar como passo manual.

### `src/components/dashboard/InsightCard.tsx`
**Modificações:**
- [ ] Linha 6-10 (`TYPE_LABELS`), adicionar: `recurring_increase: 'Recurring increase',`

### `package.json`
**Modificações:**
- [ ] Correr `npx expo install react-native-gifted-charts expo-linear-gradient` (resolve automaticamente as versões compatíveis com Expo SDK 57 — não fixar versões manualmente na spec).
- [ ] Confirmar depois de instalar que `react-native-svg` (já em `15.15.4`) continua a satisfazer o peer dependency de `react-native-gifted-charts`.

### `app/(dashboard)/bills.tsx`
**Modificações:** reescrever por completo, mantendo a lista `BillGroupCard` já existente (F06) no fim do ecrã:
```tsx
import { useCallback, useMemo, useState } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchBills,
  groupBills,
  calculateBillTotals,
  calculateCategoryTotals,
  filterBillsByPeriod,
} from '@/lib/bills';
import { fetchBillInsights } from '@/lib/insights';
import { fetchUpcomingBillRenewals, type UpcomingBillRenewal } from '@/lib/events';
import { BillGroupCard } from '@/components/bills/BillGroupCard';
import { PeriodFilter } from '@/components/bills/PeriodFilter';
import { BillsSummaryCard } from '@/components/bills/BillsSummaryCard';
import { CategoryBreakdownChart } from '@/components/bills/CategoryBreakdownChart';
import { BillEvolutionChart } from '@/components/bills/BillEvolutionChart';
import { BillsAlertsSection } from '@/components/bills/BillsAlertsSection';
import { RenewalTimeline } from '@/components/dashboard/RenewalTimeline';
import type { Bill, BillPeriodFilter } from '@/types/bills';
import type { Insight } from '@/types/insights';

export default function BillsScreen() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [renewals, setRenewals] = useState<UpcomingBillRenewal[] | null>(null);
  const [period, setPeriod] = useState<BillPeriodFilter>('all');

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      Promise.all([fetchBills(user.id), fetchBillInsights(user.id), fetchUpcomingBillRenewals(user.id)]).then(
        ([loadedBills, loadedInsights, loadedRenewals]) => {
          setBills(loadedBills);
          setInsights(loadedInsights);
          setRenewals(loadedRenewals);
        }
      );
    }, [user])
  );

  const allGroups = useMemo(() => (bills ? groupBills(bills) : []), [bills]);
  const filteredGroups = useMemo(
    () => (bills ? groupBills(filterBillsByPeriod(bills, period)) : []),
    [bills, period]
  );
  const totals = useMemo(() => calculateBillTotals(filteredGroups), [filteredGroups]);
  const categoryTotals = useMemo(() => calculateCategoryTotals(filteredGroups), [filteredGroups]);

  if (bills === null || insights === null || renewals === null) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Bills</Text>
        <Text style={styles.subtitle}>Loading…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bills</Text>
      <Text style={styles.subtitle}>Track water, electricity, gas, internet, phone and insurance over time.</Text>

      {allGroups.length === 0 ? (
        <Text style={styles.subtitle}>Upload an invoice and set its category to start building history.</Text>
      ) : (
        <>
          <PeriodFilter value={period} onChange={setPeriod} />
          <BillsSummaryCard monthlyTotal={totals.monthlyTotal} annualTotal={totals.annualTotal} />
          <CategoryBreakdownChart totals={categoryTotals} />
          <BillEvolutionChart groups={filteredGroups} />
          <BillsAlertsSection insights={insights} />
          <RenewalTimeline contracts={renewals.map((r) => r.contract)} />
        </>
      )}

      {allGroups.map((group) => (
        <BillGroupCard key={`${group.category}::${group.provider}`} group={group} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
```

## Fases de Implementação

### Fase 1: Schema — tabela `events`
**Ficheiros:**
- Modificar `supabase/schema.sql`

**Critérios de sucesso (automáticos):**
- [ ] SQL aplicado sem erros no editor SQL do Supabase (por aplicar manualmente)

**Critérios de sucesso (manuais):**
- [ ] `select * from public.events limit 1;` corre sem erro
- [ ] `insert into public.events (user_id, type, due_date, source_id) values (...); insert into public.events (user_id, type, due_date, source_id) values (...) on conflict (source_id, type) do update set due_date = excluded.due_date;` confirma que a constraint de upsert funciona

### Fase 2: Tipos — `events.ts`, `BillPeriodFilter`, `RecurringIncreaseInsightData`
**Ficheiros:**
- Criar `src/types/events.ts`
- Modificar `src/types/bills.ts`, `src/types/insights.ts`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros

### Fase 3: Motor de regras — `rulesEngine.ts` + `bills.ts`
**Ficheiros:**
- Modificar `src/lib/rulesEngine.ts`, `src/lib/bills.ts`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run lint` sem warnings

**Critérios de sucesso (manuais):**
- [ ] Verificação rápida ad-hoc (ex: `node -e` ou ficheiro scratch, não persistido): `monthlyEquivalent(120, 'yearly')` = 10; `annualEquivalent(50, 'bimonthly')` = 300; `isRecurringIncrease([130, 120, 110, 100])` = true; `isRecurringIncrease([100, 120, 110])` = false

### Fase 4: Eventos — `src/lib/events.ts`
**Ficheiros:**
- Criar `src/lib/events.ts`
- Modificar `src/lib/insights.ts` (exportar `RENEWAL_THRESHOLD_DAYS`)

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros

**Critérios de sucesso (manuais):**
- [ ] Com um contrato `type: 'insurance'` com `renewal_date` dentro de 30 dias, `fetchUpcomingBillRenewals(userId)` devolve uma entrada; correr duas vezes seguidas não duplica a linha em `events` (upsert idempotente)

### Fase 5: Insights — `recurring_increase` + `fetchBillInsights`
**Ficheiros:**
- Modificar `src/lib/insights.ts`, `supabase/functions/explain-insight/index.ts`, `src/components/dashboard/InsightCard.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros
- [ ] Deploy da edge function (`supabase functions deploy explain-insight`) — por fazer manualmente

**Critérios de sucesso (manuais):**
- [ ] Upload de 4 faturas consecutivas da mesma categoria/fornecedor com valores crescentes (ex: 30€, 32€, 35€, 40€) gera um insight `recurring_increase` com mensagem coerente em inglês
- [ ] `fetchBillInsights(userId)` só devolve insights com `bill_id` não nulo (não inclui `renewal` vindos de `contracts`)

### Fase 6: Biblioteca de gráficos + `ChipRow`
**Ficheiros:**
- Modificar `package.json` (via `npx expo install`)
- Criar `src/components/ui/ChipRow.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros
- [ ] `npx expo start` arranca sem erro de dependência nativa em falta (Expo Go)

### Fase 7: Componentes do dashboard
**Ficheiros:**
- Criar `src/components/bills/PeriodFilter.tsx`, `src/components/bills/BillsSummaryCard.tsx`, `src/components/bills/CategoryBreakdownChart.tsx`, `src/components/bills/BillEvolutionChart.tsx`, `src/components/bills/BillsAlertsSection.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run lint` sem warnings

### Fase 8: Ecrã — integração em `app/(dashboard)/bills.tsx`
**Ficheiros:**
- Modificar `app/(dashboard)/bills.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run lint` sem warnings

**Critérios de sucesso (manuais):**
- [ ] No simulador: ecrã Bills sem nenhuma fatura mostra apenas o estado vazio (sem gráficos quebrados)
- [ ] Com faturas em ≥2 categorias: totais mensal/anual coerentes com os valores esperados (conferir à mão com a fórmula de normalização), gráfico de barras mostra uma barra por categoria em `colors.primary`
- [ ] No gráfico de evolução: trocar categoria/fornecedor actualiza a linha; com <2 faturas no grupo seleccionado, mostra o estado vazio em vez de gráfico quebrado
- [ ] Secção de anomalias/aumentos mostra os insights `anomaly`/`recurring_increase`/`price_increase` de bills, destacados a dourado (`colors.warning`/`accent`), com o texto já gerado por `explain-insight`
- [ ] Lista de renovações mostra contratos `insurance`/`utility` com `renewal_date` nos próximos 30 dias
- [ ] Trocar o filtro de período (mês/trimestre/ano/tudo) actualiza totais/gráficos sem re-consultar o Supabase (verificar na rede/consola que só há 3 chamadas por focus, não uma por troca de filtro)

## Estratégia de Testes

- **Unit:** nenhuma suite automatizada existe no projecto (sem `jest`/`vitest` em `package.json`) — não introduzir uma nesta ficha, consistente com F04/F05/F06. Validação via `tsc --noEmit` + `expo lint` + verificação ad-hoc das funções puras novas (Fase 3) + testes manuais no simulador.
- **Manual:** ver "Critérios de sucesso (manuais)" de cada fase. Sequência mínima para validar o fluxo completo: upload de faturas em ≥2 categorias (para totais/gráfico de categoria), ≥2 faturas do mesmo fornecedor (para evolução), ≥4 faturas crescentes consecutivas (para `recurring_increase`), 1 contrato `insurance`/`utility` com `renewal_date` próxima (para a lista de renovações).

## Notas de Implementação

- **Separação cálculo/explicação mantida:** `isRecurringIncrease`/`monthlyEquivalent`/`annualEquivalent` são funções puras em `rulesEngine.ts`, sem I/O; `generateInsightsForBill` só passa números já calculados a `explainInsight`, nunca documentos brutos — consistente com `CLAUDE.md` regra #6.
- **`events` só é escrito para o subconjunto necessário a esta ficha** (renovações de contratos `insurance`/`utility`) — não sincronizar `expiry`/`deadline` a partir de `coverage`/`assets` aqui; isso fica para F08, evitando antecipar trabalho sem consumidor.
- **Filtro de período não deve recalcular `average6`/`average12`/anomalias:** esses valores vêm de `insights` (já persistidos no upload) e de `groupBills(bills)` sem filtro (lista crua); só `filteredGroups` (usado nos totais/gráficos novos) responde ao filtro. Não reaproveitar `filteredGroups` para a lista `BillGroupCard` no fim do ecrã.
- **`BillEvolutionChart` reinicia o fornecedor seleccionado (`provider: null`) sempre que a categoria muda**, para nunca mostrar um fornecedor de outra categoria.
- **`ChipRow` é novo e genérico** — não alterar `BillCategorySelector.tsx`/`BillingPeriodSelector.tsx` (F06) para o usarem; essa refactorização não foi pedida nesta ficha.
- **Nenhuma migração de dados históricos** para `events`: só contratos existentes no momento em que o Bills Dashboard carrega entram na sincronização (via `syncRenewalEvents`, chamado a cada focus do ecrã) — não há backfill único nem trigger na base de dados.
- **Confirmar a nota de scope do ponto 2** ("Decisões tomadas") antes de `/implement` — é a decisão com maior desvio face ao texto literal do ticket.

## Referências

- Research: `thoughts/shared/research/2026-09-15-bills-dashboard.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-bills-dashboard.md`
- Padrão de agregação a reutilizar: `src/lib/bills.ts:69-87` (`groupBills`)
- Motor de regras a reutilizar/estender: `src/lib/rulesEngine.ts:61-79`
- Padrão de insight a reutilizar/estender: `src/lib/insights.ts:56-86` (`saveInsight`), `src/lib/insights.ts:134-183` (`generateInsightsForBill`)
- Padrão de renovações sem tabela `events` (referência antes desta ficha): `src/lib/insights.ts:196-205` (`fetchUpcomingRenewals`)
- Padrão de ecrã com múltiplas fontes agregadas: `app/(dashboard)/index.tsx:17-27`
- Padrão de selector de chips (origem do `ChipRow` genérico): `src/components/bills/BillCategorySelector.tsx` (ver spec F06)
- Ponto de integração do ecrã: `app/(dashboard)/bills.tsx` (actual, F06)
