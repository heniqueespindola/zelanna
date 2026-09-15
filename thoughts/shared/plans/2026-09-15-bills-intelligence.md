---
data: 2026-09-15
feature: "Bills Intelligence (F06)"
research: "thoughts/shared/research/2026-09-15-bills-intelligence.md"
status: em_progresso
---

# Spec: Bills Intelligence (F06)

## Visão Geral

Adiciona a tabela `bills` e o campo `category` à extracção Vision LLM, para transformar faturas de utilities (água, eletricidade, gás, internet, telemóvel, telefone, seguro) num histórico por categoria/fornecedor com alertas de aumento mensal (`price_increase`, reaproveitado de F05) e de anomalia face à média de 6 meses (`anomaly`, novo), reutilizando 100% o motor de regras (`rulesEngine.ts`) e o padrão de insight (`insights.ts` + `explain-insight`) já validados em F05.

## Decisões tomadas (resolvendo as questões em aberto do research)

1. **Origem de `bills.category`:** extraída pelo Vision LLM, como extensão do schema de `extract-document` (campo novo `category`, paralelo a `document_type`). Nunca inferida por keywords no cliente.
2. **Coexistência com F05:** quando um documento com `document_type` `'invoice'` ou `'insurance'` recebe uma categoria de bill não-nula, o pipeline de `bills` passa a ser a única fonte do insight de aumento de preço para esse documento — `matchDocumentToContract` continua a correr (mantém `contracts`/renewal tracking inalterado), mas `generateInsightsForContract` passa a receber `includePriceIncrease: false` nesse caso, para não duplicar o alerta de aumento.
3. **`billing_period`:** capturado via UI (novo `BillingPeriodSelector`, default `'monthly'`), guardado em `bills.billing_period`, **sem** lógica de gating na comparação nesta ficha (fica disponível para F07).
4. **Categorias em inglês** (`'water' | 'electricity' | 'gas' | 'internet' | 'mobile' | 'landline' | 'insurance'`), não os valores em português do `CLAUDE.md` — consistente com o resto do schema de tipos já implementado (`DocumentType`, `ContractType`, `AssetCategory` são todos em inglês) e com a regra #12 do `CLAUDE.md` (produto English-first).
5. **Documentos elegíveis para `bills`:** só `document_type === 'invoice'` ou `document_type === 'insurance'` (não `'contract'`) — são os dois tipos já tratados como recorrentes por `mapDocumentTypeToContractType`, e cobrem as 7 categorias pedidas (incluindo seguro).
6. **Uma linha em `bills` só é criada quando `category !== null` e `provider`/`amount` estão preenchidos** — se a categoria ficar `null` (LLM não conseguiu determinar), não é criada linha em `bills` nesta ficha (sem fluxo de correcção manual pós-gravação — fora do escopo, o utilizador pode simplesmente escolher a categoria certa no formulário de preview antes de confirmar).
7. **Não é gerado insight de "12 meses"** — o `average` de 12 meses é apenas calculado/mostrado no ecrã Bills (não gera um novo tipo de insight); os únicos insights novos/reaproveitados são `price_increase` (>10% vs. fatura anterior) e `anomaly` (>25% vs. média de 6 meses), tal como pedido nos critérios de aceitação do ticket.

## Ficheiros a Criar

### `supabase/migrations/` — não existe pasta de migrations no projecto; alterações vão directamente para `supabase/schema.sql` (padrão já usado por F04/F05, ver `alter table ... add column if not exists` já presente no ficheiro)

### `src/types/bills.ts`
**Propósito:** Tipos de domínio para bills, seguindo o padrão de `src/types/contracts.ts`.
**Conteúdo:**
```ts
export type BillCategory =
  | 'water'
  | 'electricity'
  | 'gas'
  | 'internet'
  | 'mobile'
  | 'landline'
  | 'insurance';

export type BillingPeriod = 'monthly' | 'bimonthly' | 'yearly';

export interface Bill {
  id: string;
  user_id: string;
  provider: string;
  category: BillCategory | null;
  invoice_date: string | null;
  billing_period: BillingPeriod | null;
  amount: number | null;
  created_at: string;
}
```

### `src/lib/bills.ts`
**Propósito:** Persistência e histórico de `bills` — equivalente a `src/lib/contracts.ts`, mas sem geração de insights (isso fica em `insights.ts`, que continua a ser o único ponto de acesso à tabela `insights`, conforme padrão já estabelecido).
**Conteúdo:**
```ts
import { supabase } from '@/lib/supabase';
import { normalizeProvider } from '@/lib/contracts';
import { percentageChange } from '@/lib/rulesEngine';
import type { Bill, BillCategory, BillingPeriod } from '@/types/bills';

const BILL_COLUMNS = 'id, user_id, provider, category, invoice_date, billing_period, amount, created_at';

export async function saveBill(params: {
  userId: string;
  documentId: string;
  provider: string;
  category: BillCategory;
  invoiceDate: string | null;
  billingPeriod: BillingPeriod | null;
  amount: number;
}): Promise<Bill> {
  const { data, error } = await supabase
    .from('bills')
    .insert({
      user_id: params.userId,
      provider: params.provider,
      category: params.category,
      invoice_date: params.invoiceDate,
      billing_period: params.billingPeriod,
      amount: params.amount,
    })
    .select(BILL_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save bill');
  await supabase.from('documents').update({ bill_id: data.id }).eq('id', params.documentId);
  return data;
}

export async function fetchBillHistory(params: {
  userId: string;
  category: BillCategory;
  providerNormalized: string;
}): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_COLUMNS)
    .eq('user_id', params.userId)
    .eq('category', params.category)
    .eq('provider_normalized', params.providerNormalized)
    .order('invoice_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error('Could not load bill history');
  return data ?? [];
}

export async function fetchBills(userId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_COLUMNS)
    .eq('user_id', userId)
    .order('invoice_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error('Could not load bills');
  return data ?? [];
}

export interface BillGroup {
  category: BillCategory;
  provider: string;
  bills: Bill[]; // desc by invoice_date
  latestChangePercent: number | null;
  average6: number | null;
  average12: number | null;
}

export function groupBills(bills: Bill[]): BillGroup[] {
  const map = new Map<string, BillGroup>();
  for (const bill of bills) {
    if (!bill.category) continue;
    const key = `${bill.category}::${normalizeProvider(bill.provider)}`;
    const existing = map.get(key);
    if (existing) existing.bills.push(bill);
    else map.set(key, { category: bill.category, provider: bill.provider, bills: [bill], latestChangePercent: null, average6: null, average12: null });
  }
  return Array.from(map.values()).map((group) => {
    const amounts = group.bills.map((b) => b.amount).filter((a): a is number => a !== null);
    const [latest, previous] = group.bills;
    const latestChangePercent =
      latest.amount !== null && previous?.amount != null ? percentageChange(latest.amount, previous.amount) : null;
    const average6 = amounts.length >= 6 ? average(amounts.slice(0, 6)) : null;
    const average12 = amounts.length >= 12 ? average(amounts.slice(0, 12)) : null;
    return { ...group, latestChangePercent, average6, average12 };
  });
}
```
**Nota:** `groupBills` precisa de `average` de `@/lib/rulesEngine` — adicionar ao import (`import { average, percentageChange } from '@/lib/rulesEngine';`).

### `src/components/bills/BillCategorySelector.tsx`
**Propósito:** Selector de chips para `BillCategory`, réplica estrutural de `src/components/documents/DocumentTypeSelector.tsx`, com opção `None` para permitir voltar a `null` (correcção manual da categoria sugerida pelo LLM).
**Conteúdo:**
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { BillCategory } from '@/types/bills';

interface Props {
  value: BillCategory | null;
  onChange: (value: BillCategory | null) => void;
}

const OPTIONS: { value: BillCategory | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'water', label: 'Water' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'gas', label: 'Gas' },
  { value: 'internet', label: 'Internet' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'landline', label: 'Landline' },
  { value: 'insurance', label: 'Insurance' },
];

export function BillCategorySelector({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Bill category</Text>
      <View style={styles.chips}>
        {OPTIONS.map((option) => {
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipUnselected: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  chipText: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
  chipTextSelected: { fontWeight: '700' },
});
```

### `src/components/bills/BillingPeriodSelector.tsx`
**Propósito:** Selector de chips para `BillingPeriod`, mesma estrutura, sem opção `None` (default `'monthly'` definido no formulário pai).
**Conteúdo:** idêntico ao padrão acima, com:
```tsx
const OPTIONS: { value: BillingPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'bimonthly', label: 'Bimonthly' },
  { value: 'yearly', label: 'Yearly' },
];
```
props `{ value: BillingPeriod | null; onChange: (value: BillingPeriod) => void }`, label do título: `"Billing period"`.

### `src/components/bills/BillGroupCard.tsx`
**Propósito:** Renderiza um `BillGroup` no ecrã Bills — cabeçalho (categoria + fornecedor), lista de faturas (data + valor, mais recente primeiro), badge de variação percentual mais recente, e médias de 6/12 meses quando existirem.
**Conteúdo:**
```tsx
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { BillGroup } from '@/lib/bills';

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
  group: BillGroup;
}

export function BillGroupCard({ group }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {CATEGORY_LABELS[group.category] ?? group.category} — {group.provider}
        </Text>
        {group.latestChangePercent !== null ? (
          <Badge
            label={`${group.latestChangePercent > 0 ? '+' : ''}${group.latestChangePercent.toFixed(1)}%`}
            tone={group.latestChangePercent > 10 ? 'warning' : 'info'}
          />
        ) : null}
      </View>
      {group.bills.map((bill) => (
        <View key={bill.id} style={styles.row}>
          <Text style={styles.rowText}>{bill.invoice_date ?? '—'}</Text>
          <Text style={styles.rowText}>{bill.amount !== null ? `€${bill.amount.toFixed(2)}` : '—'}</Text>
        </View>
      ))}
      {group.average6 !== null ? (
        <Text style={styles.average}>6-month average: €{group.average6.toFixed(2)}</Text>
      ) : null}
      {group.average12 !== null ? (
        <Text style={styles.average}>12-month average: €{group.average12.toFixed(2)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowText: { fontFamily: fonts.body, color: colors.border },
  average: { fontFamily: fonts.body, fontSize: 12, color: colors.border, marginTop: spacing.xs },
});
```
**Nota:** confirmar em `src/components/ui/Badge.tsx` que `tone` aceita `'info' | 'warning' | ...` (mesmo tipo usado em `InsightCard.tsx` via `insight.severity`) antes de implementar — se `Badge` só aceitar `InsightSeverity`, usar `'warning'`/`'info'` que já são valores válidos desse tipo.

## Ficheiros a Modificar

### `supabase/schema.sql`
**Modificações:**
- [x] No fim do ficheiro (depois da secção `insights`, linha 205), adicionar:
```sql
create table if not exists public.bills (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  provider text not null,
  provider_normalized text generated always as (lower(trim(provider))) stored,
  category text,              -- 'water' | 'electricity' | 'gas' | 'internet' | 'mobile' | 'landline' | 'insurance'
  invoice_date date,
  billing_period text,        -- 'monthly' | 'bimonthly' | 'yearly'
  amount numeric,
  created_at timestamptz not null default now()
);

alter table public.bills enable row level security;

create policy "Users can view own bills"
  on public.bills for select
  using (auth.uid() = user_id);

create policy "Users can insert own bills"
  on public.bills for insert
  with check (auth.uid() = user_id);

create policy "Users can update own bills"
  on public.bills for update
  using (auth.uid() = user_id);

create policy "Users can delete own bills"
  on public.bills for delete
  using (auth.uid() = user_id);

alter table public.documents
  add column if not exists bill_id uuid references public.bills(id) on delete set null;

alter table public.insights
  add column if not exists bill_id uuid references public.bills(id) on delete cascade;
```
- [ ] Este SQL precisa de ser aplicado manualmente no projecto Supabase (painel SQL editor ou CLI) — o mesmo processo já usado para as `alter table` anteriores de F04/F05.

### `src/types/documents.ts`
**Modificações:**
- [ ] Linha 1, adicionar import: `import type { BillCategory } from '@/types/bills';`
- [ ] Em `ExtractedDocumentData` (linha 3-9), adicionar campo: `category: BillCategory | null;`
- [ ] Em `UploadedDocument` (linha 17-29), adicionar campo: `bill_id: string | null;` (ao lado de `contract_id`, linha 20)

### `src/types/insights.ts`
**Modificações:**
- [ ] Linha 3: `export type InsightType = 'price_increase' | 'renewal' | 'anomaly';`
- [ ] Depois de `RenewalInsightData` (linha 13-17), adicionar:
```ts
export interface AnomalyInsightData {
  provider: string;
  category: string | null;
  currentAmount: number;
  averageAmount: number;
  deviationAmount: number;
  deviationPercent: number;
  periodMonths: number;
}
```
- [ ] Em `Insight` (linha 19-28): adicionar `bill_id: string | null;` (ao lado de `contract_id`, linha 22); actualizar `data: PriceIncreaseInsightData | RenewalInsightData;` para `data: PriceIncreaseInsightData | RenewalInsightData | AnomalyInsightData;`

### `supabase/functions/extract-document/index.ts`
**Modificações:**
- [ ] Linha 8-14 (`interface ExtractedDocumentData`), adicionar campo:
```ts
  category: 'water' | 'electricity' | 'gas' | 'internet' | 'mobile' | 'landline' | 'insurance' | null;
```
- [ ] Linha 16-26 (`EXTRACTION_SYSTEM_PROMPT`), estender o JSON de exemplo e adicionar instrução:
```
  "category": "water" | "electricity" | "gas" | "internet" | "mobile" | "landline" | "insurance" | null
```
  e instrução adicional no texto do prompt: `"category" only applies when the document is a recurring utility/insurance bill (invoice or insurance document_type); classify it into exactly one of the categories above based on the provider/content, or null if it doesn't match any or you're not confident. Never guess.`

### `supabase/functions/explain-insight/index.ts`
**Modificações:**
- [ ] Linha 12-17, depois de `RenewalBody`, adicionar:
```ts
interface AnomalyBody {
  type: 'anomaly';
  provider: string;
  category: string | null;
  currentAmount: number;
  averageAmount: number;
  deviationAmount: number;
  deviationPercent: number;
  periodMonths: number;
}
```
- [ ] Linha 19: `type RequestBody = PriceIncreaseBody | RenewalBody | AnomalyBody;`
- [ ] Linha 21-26 (`EXPLAIN_SYSTEM_PROMPT`), adicionar instrução:
```
For "anomaly": state the provider (and category, if given) and how much the current amount is above the average for the period, using the exact numbers given.
```

### `src/lib/insights.ts`
**Modificações:**
- [ ] Linha 1-10, imports: adicionar `isAnomaly, average` a par de `isSignificantIncrease, percentageChange` (linha 3-8); adicionar `AnomalyInsightData` e `BillCategory`/`Bill` aos imports de tipos (linha 10); adicionar `import { fetchBillHistory } from '@/lib/bills';` e `import type { Bill } from '@/types/bills';`
- [ ] Linha 12: `const INSIGHT_COLUMNS = 'id, user_id, contract_id, bill_id, type, severity, data, message, created_at';`
- [ ] Linha 14, adicionar: `const ANOMALY_WINDOW_MONTHS = 6;`
- [ ] `fallbackMessage` (linha 16-23): estender assinatura para `data: PriceIncreaseInsightData | RenewalInsightData | AnomalyInsightData`, adicionar ramo:
```ts
if (type === 'anomaly') {
  const d = data as AnomalyInsightData;
  return `${d.provider}: paid €${d.currentAmount.toFixed(2)}, ${d.deviationPercent.toFixed(1)}% above your ${d.periodMonths}-month average of €${d.averageAmount.toFixed(2)}.`;
}
```
- [ ] `explainInsight` (linha 25-35): estender assinatura de `data` para incluir `AnomalyInsightData`.
- [ ] `saveInsight` (linha 37-65): mudar assinatura de `params` — substituir `contractId: string` por `contractId?: string; billId?: string;`; estender `data` para incluir `AnomalyInsightData`; no `.insert`, mudar `contract_id: params.contractId` para `contract_id: params.contractId ?? null, bill_id: params.billId ?? null,`.
- [ ] `generateInsightsForContract` (linha 67-110): adicionar parâmetro `includePriceIncrease: boolean` ao objecto `params` (com valor default `true` no destructuring: `const { userId, contract, previousAmount, includePriceIncrease = true } = params;`); envolver o bloco `if (previousAmount !== null && contract.current_amount !== null) { ... }` (linha 75-89) com `if (includePriceIncrease && ...)`; chamadas a `saveInsight` dentro desta função passam a usar `contractId: contract.id` (renomear a chave, já é isso — sem mudança de valor, só a assinatura do tipo já mudou acima).
- [ ] Adicionar nova função exportada, depois de `generateInsightsForContract`:
```ts
export async function generateInsightsForBill(params: {
  userId: string;
  bill: Bill;
}): Promise<Insight[]> {
  const { userId, bill } = params;
  const created: Insight[] = [];
  if (!bill.category || bill.amount === null) return created;

  const providerNormalized = normalizeProvider(bill.provider);
  const history = (await fetchBillHistory({ userId, category: bill.category, providerNormalized }))
    .filter((b) => b.id !== bill.id);

  if (history.length >= 1 && history[0].amount !== null) {
    const previous = history[0];
    const changePercent = percentageChange(bill.amount, previous.amount as number);
    if (isSignificantIncrease(bill.amount, previous.amount as number, PRICE_INCREASE_THRESHOLD_PERCENT)) {
      const data: PriceIncreaseInsightData = {
        provider: bill.provider,
        previousAmount: previous.amount as number,
        currentAmount: bill.amount,
        changeAmount: bill.amount - (previous.amount as number),
        changePercent,
      };
      created.push(await saveInsight({ userId, billId: bill.id, type: 'price_increase', severity: 'warning', data }));
    }
  }

  const last6 = history.slice(0, ANOMALY_WINDOW_MONTHS).map((b) => b.amount).filter((a): a is number => a !== null);
  if (last6.length === ANOMALY_WINDOW_MONTHS) {
    const avg6 = average(last6);
    if (isAnomaly(bill.amount, avg6)) {
      const data: AnomalyInsightData = {
        provider: bill.provider,
        category: bill.category,
        currentAmount: bill.amount,
        averageAmount: avg6,
        deviationAmount: bill.amount - avg6,
        deviationPercent: percentageChange(bill.amount, avg6),
        periodMonths: ANOMALY_WINDOW_MONTHS,
      };
      created.push(await saveInsight({ userId, billId: bill.id, type: 'anomaly', severity: 'warning', data }));
    }
  }

  return created;
}
```
- [ ] Adicionar `import { normalizeProvider } from '@/lib/contracts';` ao topo do ficheiro (necessário para `generateInsightsForBill`).
- [ ] **Nota de ordenação:** `history` vem de `fetchBillHistory` já ordenado `invoice_date desc` (ver `src/lib/bills.ts`); o registo mais recente entre os anteriores é `history[0]` depois de excluir o próprio `bill.id`.

### `src/components/documents/DocumentPreviewForm.tsx`
**Modificações:**
- [ ] Linha 1-10, imports: adicionar `import { BillCategorySelector } from '@/components/bills/BillCategorySelector';`, `import { BillingPeriodSelector } from '@/components/bills/BillingPeriodSelector';`, `import { saveBill } from '@/lib/bills';`, `import { generateInsightsForBill } from '@/lib/insights';` (a par do já existente `generateInsightsForContract`, linha 6); `import type { BillCategory, BillingPeriod, Bill } from '@/types/bills';`
- [ ] Linha 21-29, adicionar estado:
```ts
const [category, setCategory] = useState<BillCategory | null>(extracted.category ?? null);
const [billingPeriod, setBillingPeriod] = useState<BillingPeriod | null>('monthly');
```
- [ ] Linha 31-84 (`handleConfirm`): entre o bloco `try { const doc = await saveDocument(...) }` (linha 47-56) e o bloco existente de `matchDocumentToContract` (linha 58-77), substituir o `try/catch` best-effort actual por:
```ts
try {
  let bill: Bill | null = null;
  if ((doc.document_type === 'invoice' || doc.document_type === 'insurance') && category !== null && doc.provider !== null && doc.amount !== null) {
    bill = await saveBill({
      userId,
      documentId: doc.id,
      provider: doc.provider,
      category,
      invoiceDate: doc.date,
      billingPeriod,
      amount: doc.amount,
    });
    const billInsights = await generateInsightsForBill({ userId, bill });
    console.log('bill saved:', bill, 'insights created:', billInsights.length);
  }

  const match = await matchDocumentToContract({
    userId,
    documentId: doc.id,
    documentType: doc.document_type,
    provider: doc.provider,
    amount: doc.amount,
    date: doc.date,
    expiryDate: doc.expiry_date,
  });
  if (match) {
    const insights = await generateInsightsForContract({
      userId,
      contract: match.contract,
      previousAmount: match.previousAmount,
      includePriceIncrease: !bill,
    });
    console.log('matched contract:', match.contract, 'previousAmount:', match.previousAmount, 'insights created:', insights.length);
  } else {
    console.log('matchDocumentToContract returned null (not eligible or no provider) for document_type:', doc.document_type, 'provider:', doc.provider);
  }
} catch (matchError) {
  console.error('bills/matchDocumentToContract/generateInsights failed:', matchError);
  // matching/insight é best-effort — o documento já foi guardado com sucesso
}
```
- [ ] No JSX (depois de `<DocumentTypeSelector .../>`, linha 99), adicionar renderização condicional:
```tsx
{(documentType === 'invoice' || documentType === 'insurance') ? (
  <>
    <BillCategorySelector value={category} onChange={setCategory} />
    <BillingPeriodSelector value={billingPeriod} onChange={setBillingPeriod} />
  </>
) : null}
```

### `src/components/dashboard/InsightCard.tsx`
**Modificações:**
- [ ] Linha 1-4, adicionar import: `import type { Insight, InsightType } from '@/types/insights';` (substituir o import actual de `Insight` para incluir também `InsightType`)
- [ ] Antes do componente (depois dos imports), adicionar:
```ts
const TYPE_LABELS: Record<InsightType, string> = {
  price_increase: 'Price increase',
  renewal: 'Renewal',
  anomaly: 'Anomaly',
};
```
- [ ] Linha 13, substituir `<Badge label={insight.type === 'price_increase' ? 'Price increase' : 'Renewal'} tone={insight.severity} />` por `<Badge label={TYPE_LABELS[insight.type]} tone={insight.severity} />`

### `app/(dashboard)/bills.tsx`
**Modificações:** reescrever por completo, seguindo o padrão `useFocusEffect` de `app/(dashboard)/coverage.tsx` e `app/(dashboard)/index.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchBills, groupBills, type BillGroup } from '@/lib/bills';
import { BillGroupCard } from '@/components/bills/BillGroupCard';

export default function BillsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<BillGroup[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchBills(user.id).then((bills) => setGroups(groupBills(bills)));
    }, [user])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bills</Text>
      <Text style={styles.subtitle}>Track water, electricity, gas, internet, phone and insurance over time.</Text>

      {groups === null ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : groups.length === 0 ? (
        <Text style={styles.subtitle}>Upload an invoice and set its category to start building history.</Text>
      ) : (
        groups.map((group) => <BillGroupCard key={`${group.category}::${group.provider}`} group={group} />)
      )}
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

### Fase 1: Schema — tabela `bills` + colunas de ligação
**Ficheiros:**
- Modificar `supabase/schema.sql`

**Critérios de sucesso (automáticos):**
- [ ] SQL aplicado sem erros no editor SQL do Supabase (ou `supabase db push`, conforme processo já usado em F04/F05) — **SQL escrito em `schema.sql`, por aplicar manualmente (fora do alcance desta sessão)**

**Critérios de sucesso (manuais):**
- [ ] `select * from public.bills limit 1;` corre sem erro no painel Supabase
- [ ] `select bill_id from public.documents limit 1;` e `select bill_id from public.insights limit 1;` correm sem erro

### Fase 2: Tipos — `bills.ts`, extensões a `documents.ts`/`insights.ts`
**Ficheiros:**
- Criar `src/types/bills.ts`
- Modificar `src/types/documents.ts`, `src/types/insights.ts`

**Critérios de sucesso (automáticos):**
- [x] `npm run typecheck` passa sem erros

### Fase 3: Edge functions — categoria na extracção + `anomaly` na explicação
**Ficheiros:**
- Modificar `supabase/functions/extract-document/index.ts`
- Modificar `supabase/functions/explain-insight/index.ts`

**Critérios de sucesso (automáticos):**
- [ ] `npx deno check supabase/functions/extract-document/index.ts` e `npx deno check supabase/functions/explain-insight/index.ts` (ou equivalente já usado no projecto para validar as edge functions) sem erros — **`deno` não está instalado neste ambiente; não foi possível correr**
- [ ] Deploy das duas functions (`supabase functions deploy extract-document`, `supabase functions deploy explain-insight`) — **por fazer manualmente**

**Critérios de sucesso (manuais):**
- [ ] Upload de uma fatura de electricidade real (ex: EDP) devolve `category: "electricity"` no preview
- [ ] Um insight `anomaly` gerado manualmente (via chamada directa à function) devolve uma frase coerente em inglês

### Fase 4: `src/lib/bills.ts` + extensões a `src/lib/insights.ts`
**Ficheiros:**
- Criar `src/lib/bills.ts`
- Modificar `src/lib/insights.ts`

**Critérios de sucesso (automáticos):**
- [x] `npm run typecheck` passa sem erros
- [x] `npm run lint` sem warnings

### Fase 5: UI — selectors, `DocumentPreviewForm`, `InsightCard`
**Ficheiros:**
- Criar `src/components/bills/BillCategorySelector.tsx`, `src/components/bills/BillingPeriodSelector.tsx`, `src/components/bills/BillGroupCard.tsx`
- Modificar `src/components/documents/DocumentPreviewForm.tsx`, `src/components/dashboard/InsightCard.tsx`

**Critérios de sucesso (automáticos):**
- [x] `npm run typecheck` passa sem erros
- [x] `npm run lint` sem warnings

**Critérios de sucesso (manuais):**
- [ ] No simulador: fazer upload de uma fatura de invoice → preview mostra `BillCategorySelector` e `BillingPeriodSelector` (só quando document type é Invoice ou Insurance) → confirmar com categoria seleccionada não bloqueia nem falha
- [ ] Fazer upload de uma segunda fatura do mesmo fornecedor/categoria com valor >10% superior → aparece novo insight `Price increase` no dashboard (Recent insights), e **não** aparece um segundo insight de aumento vindo de `contracts` para o mesmo documento
- [ ] Fazer upload de 6 faturas históricas da mesma categoria/fornecedor com valores estáveis, seguidas de uma 7ª >25% acima da média → aparece insight `Anomaly`

### Fase 6: Ecrã Bills
**Ficheiros:**
- Modificar `app/(dashboard)/bills.tsx`

**Critérios de sucesso (automáticos):**
- [x] `npm run typecheck` passa sem erros
- [x] `npm run lint` sem warnings

**Critérios de sucesso (manuais):**
- [ ] Ecrã Bills mostra o histórico agrupado por categoria+fornecedor, com data/valor de cada fatura e badge de variação percentual mais recente
- [ ] Com 6+ faturas na mesma categoria/fornecedor, aparece a média de 6 meses; com 12+, aparece também a média de 12 meses
- [ ] Ecrã vazio (sem bills) mostra a mensagem de estado vazio, não um erro

## Estratégia de Testes

- **Unit:** nenhuma suite de testes automatizados existe no projecto (não há `jest`/`vitest` no `package.json`) — não introduzir uma nesta ficha; validação via `tsc --noEmit` + `expo lint` + testes manuais no simulador, tal como F04/F05.
- **Manual:** ver "Critérios de sucesso (manuais)" de cada fase acima. Sequência mínima para validar o fluxo completo: upload de ≥2 faturas da mesma categoria/fornecedor (para `price_increase`) e ≥7 faturas para validar `anomaly`; confirmar que o dashboard mostra os insights e que o ecrã Bills mostra o histórico agrupado.

## Notas de Implementação

- **Separação cálculo/explicação mantida:** `generateInsightsForBill` calcula tudo com `percentageChange`/`isSignificantIncrease`/`isAnomaly`/`average` (já existentes, sem duplicação) e só passa os números já calculados a `explainInsight`/`explain-insight`, nunca documentos brutos — consistente com `CLAUDE.md` regra #6.
- **`insights.ts` continua a ser o único ponto de acesso à tabela `insights`** — `generateInsightsForBill` fica lá, não em `bills.ts`, mantendo o padrão já estabelecido pelo research.
- **`bill_id` e `contract_id` em `insights` são ambos nullable** — um insight de bill tem `contract_id: null`, um insight de contract tem `bill_id: null`. Não introduzir `source_type`/`source_id` genérico nesta ficha (mudança maior de schema, fora do escopo desta ficha, consistente com a nota do ticket sobre custo/benefício).
- **`includePriceIncrease` é `true` por omissão** em `generateInsightsForContract` — isto preserva o comportamento actual de F05 para qualquer chamada existente/futura que não passe explicitamente `false` (nenhum outro ponto de chamada existe hoje além de `DocumentPreviewForm.tsx`, mas o default evita quebrar silenciosamente outros fluxos).
- **Nenhuma migração de dados históricos:** faturas já guardadas antes desta ficha (sem `category`) não retroagem para `bills` — só novas faturas confirmadas após o deploy desta ficha entram no histórico. Isto é aceitável para o MVP (consistente com "Fora do escopo" do ticket, que não pede backfill).
- **`amount` como `numeric` no Postgres chega ao cliente como `number`** (padrão já usado por `contracts.current_amount`/`documents.amount`) — não é preciso tratamento especial de tipo.
- **Confirmar `src/components/ui/Badge.tsx`** antes de implementar `BillGroupCard.tsx`, para garantir que o `tone` usado (`'info' | 'warning'`) é aceite pela prop existente.

## Referências

- Research: `thoughts/shared/research/2026-09-15-bills-intelligence.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-bills-intelligence.md`
- Padrão de insight a reutilizar: `src/lib/insights.ts:37-65` (`saveInsight`), `src/lib/insights.ts:67-110` (`generateInsightsForContract`)
- Padrão de matching por fornecedor a reutilizar: `src/lib/contracts.ts:8-17,29-38`
- Padrão de ecrã com `useFocusEffect`: `app/(dashboard)/coverage.tsx`
- Padrão de selector de categoria: `src/components/documents/DocumentTypeSelector.tsx`, `src/components/coverage/AssetCategorySelector.tsx`
- Ponto de integração no upload: `src/components/documents/DocumentPreviewForm.tsx:31-84`
