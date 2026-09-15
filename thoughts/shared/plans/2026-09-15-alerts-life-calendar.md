---
data: 2026-09-15
feature: "Alerts e Life Calendar básico (F08)"
research: "thoughts/shared/research/2026-09-15-alerts-life-calendar.md"
status: completo
---

# Spec: Alerts e Life Calendar básico (F08)

## Visão Geral

Cria um ecrã consolidado "Alerts" (tab nova) que mostra: (1) uma lista filtrável de `insights` (coverage / bills / renewal / all) com acção de marcar como resolvido, e (2) um Life Calendar de 60 dias com os eventos de renovação de **todos** os `contracts` (não só insurance/utility). Introduz `coverage_gap` como novo `InsightType`, persistido (upsert idempotente) sempre que o ecrã Alerts avalia a cobertura de todos os assets do utilizador.

## Decisões estruturais (confirmadas com o utilizador)

1. **Bucket "coverage"** → persistir como novo `InsightType = 'coverage_gap'`, gerado (upsert, não insert simples) no load do ecrã Alerts via `generateCoverageGapInsights(userId)`, correndo `evaluateCoverage()` em lote para todos os assets do utilizador.
2. **`syncRenewalEvents`** → generalizado para todos os `contracts` com `renewal_date` (não só insurance/utility) quando alimenta o Life Calendar. `RENEWAL_THRESHOLD_DAYS = 30` mantém-se inalterado e continua a controlar apenas a severidade/geração do insight `renewal` (`generateInsightsForContract`) e a janela do ecrã Bills (`fetchUpcomingBillRenewals`, inalterado). O calendário de 60 dias usa um novo parâmetro explícito `windowDays`.
3. **Navegação** → tab nova `alerts` em `app/(dashboard)/_layout.tsx`. O `index.tsx` (Dashboard) mantém-se inalterado como resumo compacto — sem duplicar a nova lógica de filtro/calendário.
4. **Coluna de estado em `insights`** → `resolved_at timestamptz null` (não booleano), consistente com o padrão `created_at` do schema.
5. **Calendário** → lista agrupada por data, sem biblioteca nova (`react-native-calendars` não é necessário).

### Decisão de implementação adicional (dedupe de `coverage_gap`)

`insights` não tem hoje nenhuma unique constraint. Para que `generateCoverageGapInsights` seja idempotente (não crie linhas duplicadas a cada visita ao ecrã Alerts), a spec adiciona duas colunas novas a `insights` — `asset_id` e `coverage_type` — e uma unique index parcial `(asset_id, type, coverage_type) where asset_id is not null`. O upsert usa `onConflict: 'asset_id,type,coverage_type'`. Isto segue o mesmo padrão já usado por `events` (`unique(source_id, type)`).

---

## Ficheiros a Criar

### `src/components/dashboard/AlertsFilter.tsx`
**Propósito:** Chip row do filtro all/coverage/bills/renewal no ecrã Alerts.
**Conteúdo:**
```tsx
import { ChipRow } from '@/components/ui/ChipRow';
import type { AlertsFilter as AlertsFilterValue } from '@/types/insights';

const OPTIONS: { value: AlertsFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'bills', label: 'Bills' },
  { value: 'renewal', label: 'Renewal' },
];

interface Props {
  value: AlertsFilterValue;
  onChange: (value: AlertsFilterValue) => void;
}

export function AlertsFilter({ value, onChange }: Props) {
  return <ChipRow options={OPTIONS} value={value} onChange={onChange} />;
}
```
Segue exactamente o padrão de `src/components/bills/PeriodFilter.tsx`.

### `src/components/dashboard/LifeCalendar.tsx`
**Propósito:** Lista de eventos de renovação agrupada por data, dentro da janela de 60 dias.
**Conteúdo:**
```tsx
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { daysUntil } from '@/lib/rulesEngine';
import { groupEventsByDate } from '@/lib/events';
import type { ContractRenewalEvent } from '@/lib/events';

interface Props {
  entries: ContractRenewalEvent[];
}

export function LifeCalendar({ entries }: Props) {
  const groups = useMemo(() => groupEventsByDate(entries), [entries]);

  if (groups.length === 0) {
    return <Text style={styles.empty}>No renewals in the next 60 days.</Text>;
  }

  return (
    <View style={styles.list}>
      {groups.map((group) => (
        <View key={group.date} style={styles.group}>
          <Text style={styles.date}>{group.date}</Text>
          {group.entries.map(({ event, contract }) => (
            <Text key={event.id} style={styles.row}>
              {contract.provider} — renews in {daysUntil(event.due_date as string)} days
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.body, color: colors.border },
  list: { gap: spacing.sm },
  group: { gap: spacing.xs },
  date: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  row: { fontFamily: fonts.body, color: colors.border },
});
```

### `app/(dashboard)/alerts.tsx`
**Propósito:** Ecrã consolidado de Alerts — filtro + lista de insights (com resolve) + Life Calendar.
**Conteúdo:**
```tsx
import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchAllInsights,
  generateCoverageGapInsights,
  filterInsightsByBucket,
  resolveInsight,
} from '@/lib/insights';
import { fetchLifeCalendarEvents } from '@/lib/events';
import { AlertsFilter } from '@/components/dashboard/AlertsFilter';
import { LifeCalendar } from '@/components/dashboard/LifeCalendar';
import { InsightCard } from '@/components/dashboard/InsightCard';
import type { Insight, AlertsFilter as AlertsFilterValue } from '@/types/insights';
import type { ContractRenewalEvent } from '@/lib/events';

export default function AlertsScreen() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<ContractRenewalEvent[] | null>(null);
  const [filter, setFilter] = useState<AlertsFilterValue>('all');
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    await generateCoverageGapInsights(user.id);
    const [loadedInsights, loadedEvents] = await Promise.all([
      fetchAllInsights(user.id, { includeResolved: showResolved }),
      fetchLifeCalendarEvents(user.id),
    ]);
    setInsights(loadedInsights);
    setCalendarEntries(loadedEvents);
  }, [user, showResolved]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleResolve = async (insightId: string) => {
    await resolveInsight(insightId);
    setInsights((prev) => (prev ? prev.filter((i) => i.id !== insightId) : prev));
  };

  const filteredInsights = useMemo(
    () => (insights ? filterInsightsByBucket(insights, filter) : []),
    [insights, filter]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.subtitle}>What needs your attention, and what&apos;s coming up.</Text>

      <AlertsFilter value={filter} onChange={setFilter} />

      {insights === null ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : filteredInsights.length === 0 ? (
        <Text style={styles.subtitle}>Nothing here right now.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {filteredInsights.map((insight) => (
            <View key={insight.id} style={styles.insightRow}>
              <InsightCard insight={insight} />
              <Pressable onPress={() => handleResolve(insight.id)}>
                <Text style={styles.resolveLink}>Resolve</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={() => setShowResolved((prev) => !prev)}>
        <Text style={styles.resolveLink}>{showResolved ? 'Hide resolved' : 'Show resolved'}</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Next 60 days</Text>
        {calendarEntries === null ? (
          <Text style={styles.subtitle}>Loading…</Text>
        ) : (
          <LifeCalendar entries={calendarEntries} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
  insightRow: { gap: spacing.xs },
  resolveLink: { fontFamily: fonts.body, color: colors.accent, fontWeight: '600' },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
});
```
Nota: `showResolved` está no `useCallback` deps de `load`, por isso mudar o toggle já dispara um novo fetch sem precisar de `useFocusEffect` extra.

---

## Ficheiros a Modificar

### `supabase/schema.sql`
**Modificações (após o bloco actual de `insights`, linhas 177-204, e antes/depois do `alter table insights add column bill_id` em 239-240):**
- [ ] Adicionar, junto ao `alter table public.insights add column if not exists bill_id ...` (linha 239-240), três novas linhas:
```sql
alter table public.insights
  add column if not exists asset_id uuid references public.assets(id) on delete cascade;

alter table public.insights
  add column if not exists coverage_type text;   -- 'warranty' | 'insurance', só para type='coverage_gap'

alter table public.insights
  add column if not exists resolved_at timestamptz;

create unique index if not exists insights_coverage_gap_unique
  on public.insights (asset_id, type, coverage_type)
  where asset_id is not null;
```
- [ ] Nenhuma alteração de RLS necessária — a policy `update`/`select` existente em `insights` (`auth.uid() = user_id`) já cobre as novas colunas.
- [ ] Comentário no `type` da tabela `insights` (linha 181, `-- 'price_increase' | 'renewal'`) pode ser actualizado para `-- 'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase' | 'coverage_gap'` (opcional, só documentação).

### `src/types/insights.ts`
**Modificações:**
- [ ] `InsightType`: adicionar `'coverage_gap'`:
  ```ts
  export type InsightType = 'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase' | 'coverage_gap';
  ```
- [ ] Adicionar novo tipo de dados:
  ```ts
  export interface CoverageGapInsightData {
    assetName: string;
    coverageType: 'warranty' | 'insurance';
    reason: 'missing' | 'expired';
    endDate: string | null;
  }
  ```
- [ ] Adicionar union alias para reduzir repetição do tipo composto (usado em `Insight.data`, `saveInsight`, `explainInsight`, `fallbackMessage`):
  ```ts
  export type InsightData =
    | PriceIncreaseInsightData
    | RenewalInsightData
    | AnomalyInsightData
    | RecurringIncreaseInsightData
    | CoverageGapInsightData;
  ```
- [ ] `Insight`: adicionar `asset_id`, `coverage_type`, `resolved_at`, e usar `InsightData`:
  ```ts
  export interface Insight {
    id: string;
    user_id: string;
    contract_id: string | null;
    bill_id: string | null;
    asset_id: string | null;
    coverage_type: 'warranty' | 'insurance' | null;
    type: InsightType;
    severity: InsightSeverity;
    data: InsightData;
    message: string;
    resolved_at: string | null;
    created_at: string;
  }
  ```
- [ ] Adicionar tipo do filtro do ecrã Alerts:
  ```ts
  export type AlertsFilter = 'all' | 'coverage' | 'bills' | 'renewal';
  ```

### `src/lib/rulesEngine.ts`
**Modificações:**
- [ ] Adicionar, a seguir a `evaluateCoverage` (depois da linha 60), uma função pura de severidade determinística para gaps de cobertura:
  ```ts
  export function coverageGapSeverity(reason: 'missing' | 'expired'): InsightSeverity {
    return reason === 'expired' ? 'critical' : 'warning';
  }
  ```
  Regra: `expired` é mais grave (já esteve protegido e deixou de estar) do que `missing` (nunca chegou a registar cobertura) — mesma lógica de "quanto mais próximo/mais perdido, mais crítico" já usada em `generateInsightsForContract` (`days <= 7 ? 'critical' : 'warning'`).

### `src/lib/coverage.ts`
**Modificações:**
- [ ] Adicionar função de leitura em lote (sem `.eq('asset_id', ...)`, a RLS já restringe ao utilizador autenticado — ver `supabase/schema.sql:113-118`):
  ```ts
  export async function fetchCoverageForUser(): Promise<CoverageRecord[]> {
    const { data, error } = await supabase.from('coverage').select(COVERAGE_COLUMNS);
    if (error) throw new Error('Could not load coverage');
    return data ?? [];
  }
  ```

### `src/lib/insights.ts`
**Modificações:**
- [ ] Import: trocar os 4 tipos de dados individuais por `type { InsightData, Insight, InsightType, CoverageGapInsightData, AlertsFilter } from '@/types/insights'` (manter os individuais só onde ainda são usados por nome, ex. `PriceIncreaseInsightData` em `generateInsightsForContract`/`generateInsightsForBill` — manter esses imports, só trocar as assinaturas internas genéricas por `InsightData`).
- [ ] `INSIGHT_COLUMNS`: incluir as três colunas novas:
  ```ts
  const INSIGHT_COLUMNS =
    'id, user_id, contract_id, bill_id, asset_id, coverage_type, type, severity, data, message, resolved_at, created_at';
  ```
- [ ] `fallbackMessage`: assinatura passa a `(type: InsightType, data: InsightData): string`; adicionar novo caso antes do fallback final de `renewal`:
  ```ts
  if (type === 'coverage_gap') {
    const d = data as CoverageGapInsightData;
    if (d.reason === 'expired') {
      return `${d.assetName}: ${d.coverageType} coverage expired${d.endDate ? ` on ${d.endDate}` : ''}.`;
    }
    return `${d.assetName}: no ${d.coverageType} coverage on record.`;
  }
  ```
- [ ] `explainInsight`: assinatura passa a `(type: InsightType, data: InsightData): Promise<string>` — corpo inalterado (já é genérico, só passa `{ type, ...data }` ao edge function).
- [ ] `saveInsight`: assinatura do parâmetro `data` passa a `InsightData` (corpo inalterado).
- [ ] Adicionar nova função `upsertCoverageGapInsight` (privada, não exportada), paralela a `saveInsight` mas com `upsert`/`onConflict` em vez de `insert`:
  ```ts
  async function upsertCoverageGapInsight(params: {
    userId: string;
    assetId: string;
    severity: InsightSeverity;
    data: CoverageGapInsightData;
  }): Promise<Insight> {
    let message: string;
    try {
      message = await explainInsight('coverage_gap', params.data);
    } catch {
      message = fallbackMessage('coverage_gap', params.data);
    }

    const { data, error } = await supabase
      .from('insights')
      .upsert(
        {
          user_id: params.userId,
          asset_id: params.assetId,
          coverage_type: params.data.coverageType,
          type: 'coverage_gap' as const,
          severity: params.severity,
          data: params.data,
          message,
        },
        { onConflict: 'asset_id,type,coverage_type' }
      )
      .select(INSIGHT_COLUMNS)
      .single();
    if (error || !data) throw new Error('Could not save coverage gap insight');
    return data;
  }
  ```
- [ ] Adicionar `generateCoverageGapInsights`, chamada pelo ecrã Alerts no load:
  ```ts
  export async function generateCoverageGapInsights(userId: string): Promise<Insight[]> {
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
      const { gaps } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
      for (const gap of gaps) {
        const data: CoverageGapInsightData = {
          assetName: asset.name,
          coverageType: gap.type,
          reason: gap.reason,
          endDate: gap.end_date,
        };
        created.push(
          await upsertCoverageGapInsight({
            userId,
            assetId: asset.id,
            severity: coverageGapSeverity(gap.reason),
            data,
          })
        );
      }
    }
    return created;
  }
  ```
  Requer novos imports: `evaluateCoverage`, `coverageGapSeverity` de `@/lib/rulesEngine`; `fetchAssets`, `fetchCoverageForUser` de `@/lib/coverage`; `type { CoverageRecord } from '@/types/coverage'`.
- [ ] Adicionar `fetchAllInsights` (usada pelo ecrã Alerts, com opção de incluir resolvidos):
  ```ts
  export async function fetchAllInsights(
    userId: string,
    params?: { includeResolved?: boolean }
  ): Promise<Insight[]> {
    let query = supabase
      .from('insights')
      .select(INSIGHT_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!params?.includeResolved) query = query.is('resolved_at', null);
    const { data, error } = await query;
    if (error) throw new Error('Could not load insights');
    return data ?? [];
  }
  ```
- [ ] Adicionar `resolveInsight`:
  ```ts
  export async function resolveInsight(insightId: string): Promise<void> {
    const { error } = await supabase
      .from('insights')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', insightId);
    if (error) throw new Error('Could not resolve insight');
  }
  ```
- [ ] Adicionar `filterInsightsByBucket` (função pura, sem I/O):
  ```ts
  export function filterInsightsByBucket(insights: Insight[], filter: AlertsFilter): Insight[] {
    if (filter === 'all') return insights;
    if (filter === 'coverage') return insights.filter((i) => i.type === 'coverage_gap');
    if (filter === 'bills') return insights.filter((i) => i.bill_id !== null);
    return insights.filter((i) => i.type === 'renewal');
  }
  ```
- [ ] **Não alterar** `fetchRecentInsights` nem `fetchBillInsights` — mantêm-se como estão (não filtram `resolved_at`, para não mudar o comportamento do Dashboard/Bills fora do âmbito desta ficha). `coverage_gap` passa a poder aparecer em `fetchRecentInsights` (Dashboard) automaticamente, o que é aceitável e não requer código novo — só precisa do label novo em `InsightCard` (ver abaixo).

### `src/lib/events.ts`
**Modificações:**
- [ ] Adicionar constante nova:
  ```ts
  const LIFE_CALENDAR_WINDOW_DAYS = 60;
  ```
- [ ] `fetchUpcomingEvents`: adicionar parâmetro `windowDays` opcional, default `RENEWAL_THRESHOLD_DAYS` (comportamento actual inalterado para quem não passa o parâmetro):
  ```ts
  export async function fetchUpcomingEvents(
    userId: string,
    windowDays: number = RENEWAL_THRESHOLD_DAYS
  ): Promise<LifeEvent[]> {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('user_id', userId)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });
    if (error) throw new Error('Could not load events');
    return (data ?? []).filter((e) => e.due_date && isExpiringSoon(e.due_date, windowDays));
  }
  ```
- [ ] Renomear `UpcomingBillRenewal` → `ContractRenewalEvent` (o tipo passa a ser usado tanto por Bills como pelo Life Calendar; nome genérico reflecte isso):
  ```ts
  export interface ContractRenewalEvent {
    event: LifeEvent;
    contract: Contract;
  }
  ```
- [ ] Extrair o `.filter().map()` de junção evento+contrato repetido, para um helper privado reutilizado por `fetchUpcomingBillRenewals` e pela nova `fetchLifeCalendarEvents`:
  ```ts
  function joinEventsWithContracts(events: LifeEvent[], contracts: Contract[]): ContractRenewalEvent[] {
    const contractsById = new Map(contracts.map((c) => [c.id, c]));
    return events
      .filter((e) => e.type === 'renewal' && e.source_id !== null && contractsById.has(e.source_id))
      .map((e) => ({ event: e, contract: contractsById.get(e.source_id as string) as Contract }));
  }
  ```
- [ ] `fetchUpcomingBillRenewals`: corpo passa a usar o helper (comportamento inalterado — continua restrito a `insurance`/`utility`, janela de 30 dias por omissão):
  ```ts
  export async function fetchUpcomingBillRenewals(userId: string): Promise<ContractRenewalEvent[]> {
    const contracts = (await fetchContracts(userId)).filter((c) =>
      c.type !== null && (BILLS_RELEVANT_CONTRACT_TYPES as readonly string[]).includes(c.type)
    );
    await syncRenewalEvents(userId, contracts);
    const events = await fetchUpcomingEvents(userId);
    return joinEventsWithContracts(events, contracts);
  }
  ```
- [ ] Adicionar `fetchLifeCalendarEvents` — todos os `contracts` com `renewal_date`, janela de 60 dias:
  ```ts
  export async function fetchLifeCalendarEvents(
    userId: string,
    windowDays: number = LIFE_CALENDAR_WINDOW_DAYS
  ): Promise<ContractRenewalEvent[]> {
    const contracts = (await fetchContracts(userId)).filter((c) => c.renewal_date !== null);
    await syncRenewalEvents(userId, contracts);
    const events = await fetchUpcomingEvents(userId, windowDays);
    return joinEventsWithContracts(events, contracts);
  }
  ```
- [ ] Adicionar `groupEventsByDate` (função pura, análoga a `groupBills` em `src/lib/bills.ts`):
  ```ts
  export function groupEventsByDate(
    entries: ContractRenewalEvent[]
  ): { date: string; entries: ContractRenewalEvent[] }[] {
    const map = new Map<string, ContractRenewalEvent[]>();
    for (const entry of entries) {
      const date = entry.event.due_date as string;
      const list = map.get(date) ?? [];
      list.push(entry);
      map.set(date, list);
    }
    return Array.from(map.entries())
      .map(([date, dateEntries]) => ({ date, entries: dateEntries }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  ```

### `app/(dashboard)/bills.tsx`
**Modificações:**
- [ ] Linha 14: `import { fetchUpcomingBillRenewals, type UpcomingBillRenewal } from '@/lib/events';` → `import { fetchUpcomingBillRenewals, type ContractRenewalEvent } from '@/lib/events';`
- [ ] Linha 29: `const [renewals, setRenewals] = useState<UpcomingBillRenewal[] | null>(null);` → usar `ContractRenewalEvent[]`.
- [ ] Nenhuma outra mudança — comportamento do ecrã Bills inalterado.

### `src/components/dashboard/InsightCard.tsx`
**Modificações:**
- [ ] `TYPE_LABELS`: adicionar `coverage_gap: 'Coverage gap'`.

### `app/(dashboard)/_layout.tsx`
**Modificações:**
- [ ] Adicionar tab nova entre `bills` e `settings`:
  ```tsx
  <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
  ```

### `supabase/functions/explain-insight/index.ts`
**Modificações:**
- [ ] Adicionar novo membro da união `RequestBody`:
  ```ts
  interface CoverageGapBody {
    type: 'coverage_gap';
    assetName: string;
    coverageType: 'warranty' | 'insurance';
    reason: 'missing' | 'expired';
    endDate: string | null;
  }
  ```
  e `type RequestBody = PriceIncreaseBody | RenewalBody | AnomalyBody | RecurringIncreaseBody | CoverageGapBody;`
- [ ] Adicionar linha ao `EXPLAIN_SYSTEM_PROMPT`, junto às outras três frases por tipo:
  ```
  For "coverage_gap": state the asset name, whether the warranty or insurance is missing or expired, and the date if given, using the exact information given.
  ```
- [ ] **Deploy:** esta function precisa de ser re-deployed no Supabase (`supabase functions deploy explain-insight`) — não é só código local. Documentar isto como passo manual pós-implementação.

---

## Fases de Implementação

### Fase 1: Schema + Tipos — base de dados e contratos TypeScript
**Ficheiros:**
- Modificar `supabase/schema.sql` (3 colunas novas + unique index em `insights`)
- Modificar `src/types/insights.ts` (`InsightType`, `CoverageGapInsightData`, `InsightData`, `Insight`, `AlertsFilter`)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa (mesmo com o resto do código ainda por actualizar aos novos campos — os campos novos são opcionais/nullable, não deve quebrar nada que já compila)

**Critérios de sucesso (manuais):**
- [ ] `schema.sql` aplicado ao projecto Supabase (quando o setup estiver feito) sem erros — `alter table ... add column if not exists` e `create unique index if not exists` são idempotentes, podem correr sobre uma base já existente

### Fase 2: Rules Engine + Lib — lógica determinística e acesso a dados
**Ficheiros:**
- Modificar `src/lib/rulesEngine.ts` (`coverageGapSeverity`)
- Modificar `src/lib/coverage.ts` (`fetchCoverageForUser`)
- Modificar `src/lib/insights.ts` (`INSIGHT_COLUMNS`, `fallbackMessage`, `explainInsight`, `saveInsight`, `upsertCoverageGapInsight`, `generateCoverageGapInsights`, `fetchAllInsights`, `resolveInsight`, `filterInsightsByBucket`)
- Modificar `src/lib/events.ts` (`fetchUpcomingEvents` com `windowDays`, `ContractRenewalEvent`, `joinEventsWithContracts`, `fetchUpcomingBillRenewals` refactorizado, `fetchLifeCalendarEvents`, `groupEventsByDate`)
- Modificar `app/(dashboard)/bills.tsx` (rename `UpcomingBillRenewal` → `ContractRenewalEvent`)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa sem erros
- [ ] `expo lint` passa sem warnings

**Critérios de sucesso (manuais):**
- [ ] No ecrã Bills, "Upcoming renewals" continua a mostrar só contratos insurance/utility, dentro de 30 dias — comportamento inalterado

### Fase 3: Edge Function — explicação em linguagem natural para coverage_gap
**Ficheiros:**
- Modificar `supabase/functions/explain-insight/index.ts`

**Critérios de sucesso (automáticos):**
- [ ] N/A (Deno, sem `tsc` do projecto principal)

**Critérios de sucesso (manuais):**
- [ ] `supabase functions deploy explain-insight` corrido com sucesso
- [ ] Um insight `coverage_gap` gerado no simulador mostra uma frase em linguagem natural coerente (não o fallback local) — confirmar nos logs da function ou visualmente que a mensagem não é o template fixo de `fallbackMessage`

### Fase 4: UI — componentes novos e ecrã Alerts
**Ficheiros:**
- Criar `src/components/dashboard/AlertsFilter.tsx`
- Criar `src/components/dashboard/LifeCalendar.tsx`
- Modificar `src/components/dashboard/InsightCard.tsx` (`TYPE_LABELS['coverage_gap']`)
- Criar `app/(dashboard)/alerts.tsx`
- Modificar `app/(dashboard)/_layout.tsx` (tab nova)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa sem erros
- [ ] `expo lint` passa sem warnings

**Critérios de sucesso (manuais):**
- [ ] Abrir a tab "Alerts" no simulador com um utilizador que tenha pelo menos: um asset sem cobertura (gera `coverage_gap`), um contrato com renovação dentro de 60 dias mas fora de 30 (aparece só no calendário, não seria mostrado hoje em nenhum outro ecrã), e um insight `price_increase`/`anomaly` de uma bill
- [ ] Filtro "Coverage" mostra só o `coverage_gap`; "Bills" mostra só insights com `bill_id`; "Renewal" mostra só `type='renewal'`; "All" mostra tudo
- [ ] Marcar um insight como "Resolve" remove-o da lista por omissão; "Show resolved" volta a mostrá-lo
- [ ] Revisitar o ecrã Alerts uma segunda vez **não** duplica o insight `coverage_gap` do mesmo asset (confirma o upsert/dedupe)
- [ ] Life Calendar mostra eventos agrupados por data, ordenados ascendente, só dentro dos 60 dias, incluindo contratos `subscription`/`other` (não só insurance/utility)
- [ ] Estado vazio claro quando não há insights/eventos nalgum bucket

---

## Estratégia de Testes

- **Unit (se o projecto tiver testes automatizados para `lib/`):** `coverageGapSeverity`, `filterInsightsByBucket`, `groupEventsByDate` — são funções puras, fáceis de testar sem Supabase.
- **Manual:** ver critérios de sucesso manuais de cada fase, acima. Cobrir especialmente: (a) idempotência do upsert de `coverage_gap` ao revisitar o ecrã, (b) que `RENEWAL_THRESHOLD_DAYS` (30 dias, severidade do insight `renewal`) não foi afectado pela janela de 60 dias do calendário, (c) que o ecrã Bills continua igual.

## Notas de Implementação

- **Separação determinístico/LLM mantida:** `evaluateCoverage`, `coverageGapSeverity`, `filterInsightsByBucket`, `groupEventsByDate` são puros; o LLM (`explain-insight`) só recebe o resultado já calculado e escreve uma frase — nunca calcula datas, percentagens ou severidade.
- **`resolved_at` vs. `resolved` boolean:** escolhido `resolved_at timestamptz null` — permite `is null`/`is not null` sem coluna extra e é consistente com `created_at` já usado em todo o schema.
- **Porque upsert e não insert simples para `coverage_gap`:** ao contrário de `price_increase`/`renewal`/`anomaly`/`recurring_increase` (gerados uma vez, num momento de escrita específico — confirmação de documento, upload de bill), `coverage_gap` é recalculado a cada abertura do ecrã Alerts (não há cron nem trigger de escrita equivalente para "algo mudou na cobertura"). Sem upsert, cada visita criaria uma linha nova para o mesmo gap. A unique index `(asset_id, type, coverage_type) where asset_id is not null` resolve isto sem afectar os outros tipos de insight (que continuam a usar `insert` simples e não têm `asset_id`).
- **`fetchCoverageForUser` sem parâmetro `userId`:** a tabela `coverage` não tem coluna `user_id` (só `asset_id`, com RLS a validar via join a `assets`). Passar `userId` seria um parâmetro morto — a função depende só da sessão autenticada, tal como a RLS já pressupõe (ver `supabase/schema.sql:113-118`).
- **`RENEWAL_THRESHOLD_DAYS` não muda:** continua em 30 dias, controla só a severidade do insight `renewal` e a janela por omissão de `fetchUpcomingEvents`/`fetchUpcomingBillRenewals` (ecrã Bills). O Life Calendar (60 dias) é um `windowDays` explícito, independente.
- **Scope não alterado propositadamente:** `fetchRecentInsights` (Dashboard) e `fetchBillInsights` (Bills) não filtram `resolved_at` — resolver um insight só tem efeito visível no ecrã Alerts. Isto evita alterar o comportamento de dois ecrãs fora do âmbito desta ficha; documentar como limitação conhecida caso o utilizador espere que "resolver" esconda também do Dashboard.
- **Fora do escopo (herdado do ticket):** eventos `expiry`/`deadline` a partir de `coverage`/`assets`/`documents`; notificações push/email; edição manual de eventos; vista de calendário tipo grelha mensal; geração de `coverage_gap` em background/cron.

## Referências

- Research: `thoughts/shared/research/2026-09-15-alerts-life-calendar.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-alerts-life-calendar.md`
- Padrão de filtro por período: `src/lib/bills.ts:117-128` (`filterBillsByPeriod`), `src/components/bills/PeriodFilter.tsx`
- Padrão de junção evento+contrato: `src/lib/events.ts:36-46` (`fetchUpcomingBillRenewals`, pré-refactor)
- Padrão de insight + explicação LLM com fallback: `src/lib/insights.ts:63-93` (`saveInsight`)
- Cores de severidade já no tema: `src/constants/theme.ts:18-22`
