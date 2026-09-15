---
data: 2026-09-15
feature: "Alerts e Life Calendar básico (F08)"
status: completo
---

# Research: Alerts e Life Calendar básico (F08)

## Questão de Pesquisa

Do ticket `thoughts/shared/tickets/2026-09-15-alerts-life-calendar.md` → "Próximo passo":
1. O bucket "coverage" do filtro deve persistir `coverage_gap` como novo `InsightType` (e nesse caso, em que momento é gerado — load do ecrã, upload de documento, ou cron?), ou deve reutilizar `evaluateCoverage()` em runtime sem persistência?
2. `syncRenewalEvents`/`RENEWAL_THRESHOLD_DAYS` devem ser generalizados para todos os `contracts` e para uma janela de 60 dias, ou mantém-se o alcance actual (só insurance/utility, 30 dias) e cria-se uma função separada para o calendário?
3. O ecrã de Alerts/Calendar deve ser uma tab nova em `app/(dashboard)/_layout.tsx` ou uma expansão do `index.tsx` actual?

## Sumário

`FEATURES.md:137-148` confirma que F08 é exactamente este ticket (prompt idêntico), parte da Phase 1/MVP — não há especificação adicional além do que já está no ticket. A tabela `events` e as suas RLS policies já existem (`supabase/schema.sql:242-267`), mas só é alimentada por `syncRenewalEvents()` (`src/lib/events.ts:11-18`), restrita a contratos `insurance`/`utility` e a um threshold hardcoded de 30 dias (`RENEWAL_THRESHOLD_DAYS`, `src/lib/insights.ts:27`). Não existe nenhum caminho, hoje, que persista um insight de coverage gap: `evaluateCoverage()` (`src/lib/rulesEngine.ts:33-51`) só corre em runtime, por asset seleccionado, dentro do ecrã Coverage — mas a RLS de `coverage` (`exists (select 1 from assets where assets.id = coverage.asset_id and assets.user_id = auth.uid())`, `supabase/schema.sql:113-118`) já permite ler **toda** a tabela `coverage` do utilizador numa única query, sem `.in('asset_id', ...)`, o que torna viável avaliar gaps para todos os assets de uma vez sem N+1. `insights` não tem coluna de estado lido/resolvido — precisa de migração nova, mas a policy de `update` já existe (`supabase/schema.sql:198-200`). Para a UI, o projecto já tem os componentes exactos que este ecrã precisa: `ChipRow` (filtro genérico, usado por `PeriodFilter`), `Badge` (cor por severidade, já com `#C9A15C`/`#A3402E`), `InsightCard` e `RenewalTimeline` — o trabalho novo é sobretudo composição e as três decisões estruturais listadas acima, não construir UI do zero.

## Ficheiros Relevantes da Codebase

- `FEATURES.md:137-148` — especificação canónica de F08 (Phase 1), prompt idêntico ao ticket; nenhuma informação adicional além do que já está documentado no ticket.
- `supabase/schema.sql:242-267` — tabela `events` já existe (`id, user_id, type, due_date, source_id, created_at`), com `unique(source_id, type)` e RLS completo (select/insert/update/delete por `user_id`). Não é preciso criar esta tabela.
- `src/lib/events.ts` — único ponto de leitura/escrita de `events` hoje:
  - `syncRenewalEvents(userId, contracts)` (linhas 11-18) — grava só `type: 'renewal'`, `upsert` com `onConflict: 'source_id,type'`.
  - `fetchUpcomingEvents(userId)` (linhas 20-29) — lê todos os eventos do utilizador ordenados por `due_date` asc, depois filtra em memória com `isExpiringSoon(e.due_date, RENEWAL_THRESHOLD_DAYS)` (30 dias).
  - `fetchUpcomingBillRenewals(userId)` (linhas 36-46) — filtra `contracts` para `type in (insurance, utility)` (`BILLS_RELEVANT_CONTRACT_TYPES`, linha 9), chama `syncRenewalEvents`, depois `fetchUpcomingEvents`, e junta com o contrato correspondente. É o único consumidor actual, usado em `app/(dashboard)/bills.tsx:14,35`.
- `src/types/events.ts` — `EventType = 'renewal' | 'expiry' | 'deadline'`; `expiry`/`deadline` estão no tipo mas nunca são escritos por nenhum código.
- `src/lib/insights.ts` — `RENEWAL_THRESHOLD_DAYS = 30` (linha 27), usado tanto por `fetchUpcomingRenewals()` (linha 230+, lê `contracts` directamente, sem tabela `events` — usado em `app/(dashboard)/index.tsx`) como por `fetchUpcomingEvents()` em `events.ts`. `fetchRecentInsights(userId, limit=5)` (linha 207) e `fetchBillInsights(userId, limit=10)` (linha 218) são os dois pontos de leitura de `insights` hoje, cada um com o seu próprio limite/scope — nenhum aceita filtro por `type`.
- `src/types/insights.ts` — `InsightType = 'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase'`. Não existe `coverage_gap`. `Insight` (linhas 34-43) não tem campo de estado lido/resolvido.
- `supabase/schema.sql:177-186` (+ `alter table` em 239-240) — schema actual de `insights`: `id, user_id, contract_id, bill_id, type, severity, data, message, created_at`. Sem coluna de estado. Policy `update` já existe (linhas 198-200, `using (auth.uid() = user_id)`), por isso uma nova coluna pode ser actualizada via `UPDATE` sem tocar em RLS.
- `src/lib/rulesEngine.ts:33-51` — `evaluateCoverage(records, thresholdDays=30)` calcula `{ primary, gaps }` a partir de `CoverageRecord[]`; `gaps` é `{ type: 'warranty'|'insurance', reason: 'missing'|'expired', end_date }[]`. Puro, determinístico, sem I/O — pode receber os registos de `coverage` de todos os assets de uma vez, não só um.
- `src/lib/coverage.ts` — `fetchAssets(userId)` (todos os assets do utilizador) e `fetchCoverageForAsset(assetId)` (coverage de **um** asset). Não existe hoje uma função `fetchCoverageForUser`/batch, mas a RLS de `coverage` (ver Sumário) já permite escrever essa query sem alterar a policy.
- `app/(dashboard)/coverage.tsx` — único consumidor actual de `evaluateCoverage`, via `CoverageResult.tsx`, por asset seleccionado individualmente (`useEffect` disparado por `selectedAssetId`).
- `app/(dashboard)/_layout.tsx:14-18` — tabs actuais: `index` (Dashboard), `documents`, `coverage`, `bills`, `settings`. Não existe `alerts` nem `calendar`.
- `app/(dashboard)/index.tsx` — já mostra "Upcoming renewals" (`RenewalTimeline` sobre `fetchUpcomingRenewals`) e "Recent insights" (`InsightCard` sobre `fetchRecentInsights`, limit 5, sem filtro) — sobreposição directa com as funcionalidades (1)/(2) desta ficha.
- `src/components/ui/ChipRow.tsx` — componente genérico `<ChipRow<T> options value onChange>`, já usado por `PeriodFilter` (`src/components/bills/PeriodFilter.tsx`) para o filtro de período em Bills. Padrão directo a reutilizar para o filtro "coverage / bills / renewal" (funcionalidade 3).
- `src/components/ui/Badge.tsx` — `tone: 'success'|'warning'|'critical'|'info'` → `colors.success`/`warning`/`critical`/`info`. `colors.warning = '#C9A15C'` e `colors.critical = '#A3402E'` (`src/constants/theme.ts:18-22`) já são exactamente as cores pedidas no ticket — nenhum token novo necessário.
- `src/components/dashboard/InsightCard.tsx` — já renderiza `Badge` por `insight.severity` + `TYPE_LABELS` por `insight.type`; precisa de um novo label se `coverage_gap` for introduzido como `InsightType`.
- `src/components/bills/BillsAlertsSection.tsx` — padrão de secção "lista de insights com estado vazio", reutilizável tal e qual como referência para a secção de insights do ecrã de Alerts.
- `src/lib/bills.ts:117-128` — `filterBillsByPeriod(bills, period, now)`: padrão de função pura de filtro por janela de datas em memória (`rangeStart`/`now`), directamente análogo ao que uma função `filterEventsByWindow(events, days=60, now)` precisaria de fazer para o calendário de 60 dias.
- `supabase/functions/explain-insight/index.ts` — edge function que explica insights: `switch` fechado sobre `type` (`price_increase`/`renewal`/`anomaly`/`recurring_increase`), um `system prompt` com uma frase por tipo. **Se `coverage_gap` for introduzido como `InsightType` persistido, esta function precisa de um novo caso** (`CoverageGapBody` + frase no prompt) — sem isso, `explainInsight()` falharia e cairia sempre no `fallbackMessage()` client-side (comportamento definido em `src/lib/insights.ts`, `saveInsight()` já tem `try/catch` para isto, por isso não quebra, mas perde a explicação em linguagem natural).

## Padrões de Implementação Existentes

**Filtro genérico já pronto, reutilizável directamente (`ChipRow` + `PeriodFilter`):**
```tsx
// src/components/bills/PeriodFilter.tsx
const OPTIONS: { value: BillPeriodFilter; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];
export function PeriodFilter({ value, onChange }: Props) {
  return <ChipRow options={OPTIONS} value={value} onChange={onChange} />;
}
```
O mesmo padrão serve directamente para o filtro "coverage / bills / renewal / all" desta ficha — só muda o tipo de `value` e as `OPTIONS`.

**`evaluateCoverage` já é puro e aceita qualquer lista de `CoverageRecord`, não só de um asset:**
```ts
// src/lib/rulesEngine.ts:33-51
export function evaluateCoverage(records: CoverageRecord[], thresholdDays: number = 30): CoverageEvaluation {
  const withStatus = records
    .filter((r): r is CoverageRecord & { type: CoverageType } => r.type !== null)
    .map((r) => ({ ...r, status: getCoverageStatus(r.end_date, thresholdDays) }));
  const inForce = withStatus.filter((r) => r.status !== 'expired');
  // ... primary + gaps
}
```
Hoje só é chamado com `records` de um único asset (`CoverageResult.tsx`); nada na função impede passar-lhe os registos de `coverage` de todos os assets do utilizador de uma vez, agrupando depois por `asset_id` no chamador.

**RLS de `coverage` permite leitura em lote sem alterar a policy (`supabase/schema.sql:113-118`):**
```sql
create policy "Users can view own coverage"
  on public.coverage for select
  using (exists (
    select 1 from public.assets
    where assets.id = coverage.asset_id and assets.user_id = auth.uid()
  ));
```
Uma query `supabase.from('coverage').select(COVERAGE_COLUMNS)` (sem `.eq('asset_id', ...)`) já devolve apenas as linhas do utilizador autenticado — não é preciso um novo `user_id` em `coverage` nem N chamadas por asset.

**Sync + fetch de eventos, restrito hoje a renewal/insurance-utility (`src/lib/events.ts`):**
```ts
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
```
`isExpiringSoon(dateISO, thresholdDays=30)` já aceita um threshold custom — generalizar para 60 dias é passar um segundo argumento, não reescrever lógica.

**Padrão de filtro por janela de datas em memória (`src/lib/bills.ts:117-128`), análogo ao que o calendário de 60 dias precisa:**
```ts
export function filterBillsByPeriod(bills: Bill[], period: BillPeriodFilter, now: Date = new Date()): Bill[] {
  if (period === 'all') return bills;
  const rangeStart = new Date(now);
  if (period === 'month') rangeStart.setMonth(rangeStart.getMonth() - 1);
  // ...
  return bills.filter((b) => b.invoice_date && new Date(b.invoice_date) >= rangeStart && new Date(b.invoice_date) <= now);
}
```

**Edge function `explain-insight`, fechada por `type` (precisa de extensão se `coverage_gap` persistir):**
```ts
// supabase/functions/explain-insight/index.ts
type RequestBody = PriceIncreaseBody | RenewalBody | AnomalyBody | RecurringIncreaseBody;
// system prompt tem uma frase por tipo; sem caso novo, um body 'coverage_gap' não seria tratado
```
`saveInsight()` (`src/lib/insights.ts`) já tem fallback local (`fallbackMessage`) se a function falhar/não reconhecer o tipo, por isso a app não quebra — mas perde a explicação em linguagem natural até a function ser actualizada.

## Tabelas/Queries Supabase Relevantes

- **`events`** (já existe, `supabase/schema.sql:242-267`): `id, user_id, type ('renewal'|'expiry'|'deadline'), due_date, source_id, created_at`, `unique(source_id, type)`, RLS completo. Hoje só populada com `type='renewal'` a partir de `contracts` (insurance/utility). Nenhuma linha `expiry`/`deadline` é escrita por nenhum código actual — para a funcionalidade (1) do ticket ("eventos... incluindo expirações, deadlines") isto é uma lacuna: ou se sincroniza `expiry` a partir de `coverage.end_date`, ou o ecrã mostra sempre lista vazia para esses tipos.
- **`insights`** (`supabase/schema.sql:177-186`, `+bill_id` linha 239-240): `id, user_id, contract_id, bill_id, type, severity, data (jsonb), message, created_at`. RLS com select/insert/**update**/delete já activos (linhas 190-204) — uma coluna nova de estado (ex.: `resolved_at timestamptz null`) fica de imediato editável pelo utilizador dono via `UPDATE ... WHERE id = ...`, sem alterar policies.
- **`coverage`** (`supabase/schema.sql:100-125`): `id, asset_id, type, provider, start_date, end_date, status (não usado — comentário no schema confirma "calculado em runtime, ver rulesEngine.ts"), created_at`. RLS via `exists (select ... from assets where assets.user_id = auth.uid())` — permite `select *` em lote para todos os assets do utilizador (ver acima).
- **`contracts`** (`supabase/schema.sql:144-154`): `id, user_id, provider, provider_normalized (generated), type ('insurance'|'utility'|'subscription'|'other'), start_date, renewal_date, current_amount, created_at`. `syncRenewalEvents` hoje só recebe contratos já pré-filtrados pelo chamador (`fetchUpcomingBillRenewals`) para `insurance`/`utility` — a função em si não tem esse filtro embutido, o filtro está no chamador (`src/lib/events.ts:37-39`).
- **`assets`**: usada só para `fetchAssets(userId)` (todas as linhas do utilizador) — necessária se se optar por avaliar `coverage_gap` em lote (agrupar `coverage` por `asset_id`, cruzar com `assets` para nome/categoria no insight).

## APIs Externas Relevantes

Nenhuma API externa nova é necessária para esta ficha — não há extracção, pagamento nem Gmail envolvidos. A única API externa tocada indirectamente é a Anthropic API já usada por `explain-insight` (`supabase/functions/explain-insight/index.ts`, modelo `claude-sonnet-5`, chamada REST directa a `https://api.anthropic.com/v1/messages`), relevante apenas se a opção de persistir `coverage_gap` como `InsightType` for escolhida — nesse caso a function precisa de um novo caso no `switch`/`system prompt`, seguindo exactamente o padrão dos quatro tipos já existentes.

## Code Snippets de Referência

**Badge com as cores exactas pedidas no ticket, já no tema — nenhum hex novo necessário:**
```ts
// src/constants/theme.ts:18-22
info: '#5B685F',
warning: '#C9A15C',   // pedido no ticket para severity='warning'
critical: '#A3402E',  // "vermelho subtil" pedido no ticket para severity='critical'
success: '#4A7856',
```

**`InsightCard` já pronto para reutilização directa (só precisa de `TYPE_LABELS['coverage_gap']` se esse tipo for introduzido):**
```tsx
// src/components/dashboard/InsightCard.tsx
const TYPE_LABELS: Record<InsightType, string> = {
  price_increase: 'Price increase',
  renewal: 'Renewal',
  anomaly: 'Anomaly',
  recurring_increase: 'Recurring increase',
};
export function InsightCard({ insight }: Props) {
  return (
    <View style={styles.row}>
      <Badge label={TYPE_LABELS[insight.type]} tone={insight.severity} />
      <Text style={styles.message}>{insight.message}</Text>
    </View>
  );
}
```

## Questões em Aberto

1. **Origem de dados do bucket "coverage".** Três caminhos viáveis, todos tecnicamente possíveis com o que já existe:
   - **(a) Persistir `coverage_gap` como novo `InsightType`.** Viável sem N+1 graças à RLS de `coverage` (query em lote), reutilizando `evaluateCoverage()` tal como está. Exige: migração a `InsightType`/`Insight` (`src/types/insights.ts`), novo caso em `explain-insight/index.ts`, e decidir **quando** correr a avaliação em lote (no load do ecrã de Alerts — mais simples, mas recalcula/reescreve a cada visita; no upload de documento; ou nunca em background, já que não há cron no MVP).
   - **(b) Mapear "coverage" para `events.type='expiry'`**, sincronizando a partir de `coverage.end_date` (paralelo a `syncRenewalEvents`, mas para expirações de garantia/seguro). Mais alinhado com "eventos" do que com "insights", mas não cobre o caso "missing" (sem garantia/seguro nenhum) que `evaluateCoverage` também deteta — só cobriria "expired"/"expiring soon".
   - **(c) Aceitar bucket vazio nesta ficha** e documentar como lacuna conhecida (fora do escopo, remetido para Smart Life Alerts/Phase 5). Menor esforço, mas o filtro fica com uma opção sempre vazia no MVP.
   
   Recomenda-se decidir isto em `/plan` — é a decisão com maior impacto no esforço da ficha.

2. **Alcance de `syncRenewalEvents` e janela de tempo.** Hoje restrito a `insurance`/`utility` e a `RENEWAL_THRESHOLD_DAYS=30` (partilhado com a lógica de severidade do insight `renewal`). Duas sub-decisões independentes:
   - Generalizar o filtro de tipo de contrato (incluir `subscription`/`other`) ou manter o alcance actual — sem código a alterar em `isExpiringSoon`/`evaluateCoverage`, só no array passado a `syncRenewalEvents`.
   - Introduzir uma janela de 60 dias **sem** alterar `RENEWAL_THRESHOLD_DAYS` (que continua a controlar quando um insight `renewal` é gerado/tem severidade "warning") — precisa de uma segunda função ou de um parâmetro explícito em `fetchUpcomingEvents`, já que `isExpiringSoon` aceita `thresholdDays` mas `fetchUpcomingEvents` hoje não o expõe como argumento.

3. **Localização na navegação.** `app/(dashboard)/index.tsx` já mostra "Upcoming renewals" e "Recent insights" sem filtro; este ecrã consolidado sobrepõe-se directamente. Duas opções, sem precedente claro no código para nenhuma das duas: tab nova `alerts`/`calendar` em `_layout.tsx` (risco de duplicar dados já visíveis no Dashboard), ou expandir/substituir as secções do `index.tsx` actual (risco de sobrecarregar o ecrã principal com filtro + calendário de 60 dias). A decidir em `/plan`.

4. **Coluna de estado lido/resolvido em `insights`.** Sem ambiguidade técnica (RLS já permite `UPDATE`), só falta decidir o nome/tipo da coluna (`resolved_at timestamptz null` vs. `resolved boolean`) — `resolved_at` é mais consistente com o padrão `created_at` já usado em todo o schema e permite `is null`/`is not null` para "não lidos"/"resolvidos" sem coluna booleana extra.

5. **Biblioteca de calendário.** Nenhuma está instalada (`package.json` sem `react-native-calendars` ou equivalente), mesma situação identificada no research de F07 para gráficos. "Vista de calendário simples" pode ser resolvida com uma lista agrupada por dia/semana (sem dependência nova, consistente com o resto da UI actual, toda baseada em `View`/`Text`/`ScrollView`) — a decidir em `/plan` se compensa introduzir uma biblioteca dedicada só para isto.
