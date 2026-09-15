---
data: 2026-09-15
feature: "Warranty Vault (F10)"
research: "thoughts/shared/research/2026-09-15-warranty-vault.md"
status: completo
---

# Spec: Warranty Vault (F10)

## Visão Geral

Completa o CRUD de `assets`/`coverage` (hoje só criação via `createAssetFromDocument`), adiciona `seller`/`return_deadline` a `assets` e duas tabelas novas (`maintenance`, `claims`), introduz dois `InsightType` novos (`coverage_expiring`, `return_deadline`) gerados pelo mesmo rules engine determinístico já existente, generaliza `src/lib/events.ts` para incluir esses eventos no Life Calendar, e cria o ecrã novo de Warranty Vault (`app/(dashboard)/assets/`) com tab própria.

## Decisões tomadas (input do utilizador)

1. **`return_deadline`** → coluna `date` em `assets` (não um novo `type` em `coverage`). `evaluateCoverage`/`CoverageType` não mudam.
2. **`src/lib/events.ts`** → união discriminada `LifeCalendarEntry` (`{ source: 'contract', contract }` | `{ source: 'asset', asset, coverageType }` | `{ source: 'asset_return_deadline', asset }`). Só afecta `fetchLifeCalendarEvents`/`LifeCalendar.tsx` — `fetchUpcomingBillRenewals`/`ContractRenewalEvent` (usado em `bills.tsx`) fica intocado.
3. **CRUD novo** → estende `src/lib/coverage.ts` (não cria `src/lib/assets.ts`).
4. **Navegação** → tab novo `Tabs.Screen name="assets"` em `app/(dashboard)/_layout.tsx`.

## Decisões técnicas adicionais (sem impacto de produto, resolvidas nesta spec)

- **Índice único de `insights`**: `insights_coverage_gap_unique (asset_id, type, coverage_type) where asset_id is not null` já é suficiente para `coverage_expiring` (tem `coverage_type`) — reutilizado sem alterações via `onConflict: 'asset_id,type,coverage_type'`. Para `return_deadline` (sem `coverage_type`, valor `NULL` não é deduplicado por um índice único normal) é necessário um índice parcial novo: `insights_asset_scoped_unique (asset_id, type) where asset_id is not null and coverage_type is null`.
- **`AlertsFilter`**: os dois tipos novos entram no bucket `'coverage'` já existente (`filterInsightsByBucket`) — sem novo valor em `AlertsFilter`.
- **Severidade `expiring soon`**: extraído um helper `expiringSeverity(days)` em `rulesEngine.ts` (warning ≤ threshold, critical ≤ 7 dias), reutilizado por `generateInsightsForContract` (renewal), `generateCoverageExpiringInsights` e `generateReturnDeadlineInsights` — mesmo padrão já usado inline em `generateInsightsForContract`.
- **Eliminação**: primeira vez que a app introduz `.delete()` a partir da UI. Padrão: `Alert.alert` de confirmação nativo (React Native) antes de qualquer `deleteAsset`/`deleteCoverage`/`deleteMaintenance`/`deleteClaim`. Sem soft-delete (consistente com o resto do schema).
- **Campos de `maintenance`/`claims`**: mínimos, sem estado pré-calculado (mesma filosofia de `coverage.status`, não usado pela app).

---

## Ficheiros a Modificar

### `supabase/schema.sql`

**Modificações (todas com `alter table ... add column if not exists` / `create table if not exists`, seguindo o padrão incremental já usado no ficheiro):**

- [x] Depois do bloco de `assets` (linha ~98), adicionar:
  ```sql
  alter table public.assets
    add column if not exists seller text,
    add column if not exists return_deadline date;
  ```
- [x] Depois do bloco de `coverage` (linha ~139), adicionar duas tabelas novas com RLS idêntica à de `coverage` (policy via `exists (select 1 from assets where assets.id = <tabela>.asset_id and assets.user_id = auth.uid())`, repetida para select/insert/update/delete):
  ```sql
  create table if not exists public.maintenance (
    id uuid default gen_random_uuid() primary key,
    asset_id uuid references public.assets(id) on delete cascade,
    date date,
    description text,
    cost numeric,
    created_at timestamptz not null default now()
  );

  alter table public.maintenance enable row level security;

  create policy "Users can view own maintenance"
    on public.maintenance for select
    using (exists (
      select 1 from public.assets
      where assets.id = maintenance.asset_id and assets.user_id = auth.uid()
    ));

  create policy "Users can insert own maintenance"
    on public.maintenance for insert
    with check (exists (
      select 1 from public.assets
      where assets.id = maintenance.asset_id and assets.user_id = auth.uid()
    ));

  create policy "Users can update own maintenance"
    on public.maintenance for update
    using (exists (
      select 1 from public.assets
      where assets.id = maintenance.asset_id and assets.user_id = auth.uid()
    ));

  create policy "Users can delete own maintenance"
    on public.maintenance for delete
    using (exists (
      select 1 from public.assets
      where assets.id = maintenance.asset_id and assets.user_id = auth.uid()
    ));

  create table if not exists public.claims (
    id uuid default gen_random_uuid() primary key,
    asset_id uuid references public.assets(id) on delete cascade,
    coverage_id uuid references public.coverage(id) on delete set null,
    date date,
    description text,
    status text not null default 'open',   -- 'open' | 'approved' | 'denied' | 'resolved'
    result text,
    created_at timestamptz not null default now()
  );

  alter table public.claims enable row level security;

  create policy "Users can view own claims"
    on public.claims for select
    using (exists (
      select 1 from public.assets
      where assets.id = claims.asset_id and assets.user_id = auth.uid()
    ));

  create policy "Users can insert own claims"
    on public.claims for insert
    with check (exists (
      select 1 from public.assets
      where assets.id = claims.asset_id and assets.user_id = auth.uid()
    ));

  create policy "Users can update own claims"
    on public.claims for update
    using (exists (
      select 1 from public.assets
      where assets.id = claims.asset_id and assets.user_id = auth.uid()
    ));

  create policy "Users can delete own claims"
    on public.claims for delete
    using (exists (
      select 1 from public.assets
      where assets.id = claims.asset_id and assets.user_id = auth.uid()
    ));
  ```
- [x] Depois de `insights_coverage_gap_unique` (linha ~253), adicionar:
  ```sql
  create unique index if not exists insights_asset_scoped_unique
    on public.insights (asset_id, type)
    where asset_id is not null and coverage_type is null;
  ```
- [x] Actualizar o comentário do `type` em `coverage` (linha ~103) para `-- 'warranty' | 'insurance' | 'extension'` (sem alteração de valor, já correcto — confirmar apenas que nenhum novo valor é necessário, dado que `return_deadline` não é um `coverage.type`).
- [x] Actualizar o comentário do `type` em `insights` (linha ~181, dentro do `create table`) para incluir os dois valores novos: `-- 'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase' | 'coverage_gap' | 'coverage_expiring' | 'return_deadline'`.

---

### `src/types/assets.ts`

**Modificações:**
- [x] `Asset`: adicionar `seller: string | null;` e `return_deadline: string | null;`
- [x] Adicionar tipos novos no fim do ficheiro:
  ```typescript
  export interface Maintenance {
    id: string;
    asset_id: string;
    date: string | null;
    description: string | null;
    cost: number | null;
    created_at: string;
  }

  export type ClaimStatus = 'open' | 'approved' | 'denied' | 'resolved';

  export interface Claim {
    id: string;
    asset_id: string;
    coverage_id: string | null;
    date: string | null;
    description: string | null;
    status: ClaimStatus;
    result: string | null;
    created_at: string;
  }
  ```

### `src/types/insights.ts`

**Modificações:**
- [x] `InsightType`: adicionar `| 'coverage_expiring' | 'return_deadline'`
- [x] `Insight.coverage_type`: alargar de `'warranty' | 'insurance' | null` para `'warranty' | 'insurance' | 'extension' | null` (o `primary` de `evaluateCoverage` pode ser `extension`)
- [x] Adicionar interfaces novas:
  ```typescript
  export interface CoverageExpiringInsightData {
    assetName: string;
    coverageType: 'warranty' | 'insurance' | 'extension';
    provider: string | null;
    endDate: string;
    daysUntilExpiry: number;
  }

  export interface ReturnDeadlineInsightData {
    assetName: string;
    returnDeadline: string;
    daysUntilDeadline: number;
  }
  ```
- [x] `InsightData`: adicionar `| CoverageExpiringInsightData | ReturnDeadlineInsightData`

---

### `src/lib/rulesEngine.ts`

**Modificações:**
- [x] Adicionar, a seguir a `coverageGapSeverity`:
  ```typescript
  export function expiringSeverity(daysUntilDue: number): InsightSeverity {
    return daysUntilDue <= 7 ? 'critical' : 'warning';
  }
  ```
- [x] Em `generateInsightsForContract`-equivalente **não** — este ficheiro não toca `insights.ts`. A refactorização de `generateInsightsForContract` para usar `expiringSeverity` é feita em `src/lib/insights.ts` (ver abaixo).

---

### `src/lib/coverage.ts`

**Modificações — CRUD completo, seguindo o padrão já usado (`ASSET_COLUMNS`/`COVERAGE_COLUMNS`, `throw new Error(...)` em erro):**

- [x] Actualizar `ASSET_COLUMNS` para incluir os campos novos:
  ```typescript
  const ASSET_COLUMNS =
    'id, user_id, name, category, brand, model, serial_number, purchase_date, purchase_price, seller, return_deadline, created_at';
  ```
- [x] Adicionar constantes:
  ```typescript
  const MAINTENANCE_COLUMNS = 'id, asset_id, date, description, cost, created_at';
  const CLAIM_COLUMNS = 'id, asset_id, coverage_id, date, description, status, result, created_at';
  ```
- [x] Adicionar `fetchAssetById(assetId: string): Promise<Asset | null>` — `select(ASSET_COLUMNS).eq('id', assetId).maybeSingle()`, usado pela vista de detalhe (deep-link directo sem depender de a lista já estar em memória).
- [x] Adicionar `fetchDocumentForAsset(assetId: string): Promise<UploadedDocument | null>` — `from('documents').select('*').eq('asset_id', assetId).maybeSingle()` (mostra a "Invoice" de origem na vista de detalhe).
- [x] Adicionar `createAsset(params: { userId: string; name: string; category: AssetCategory | null; brand: string | null; model: string | null; serialNumber: string | null; purchaseDate: string | null; purchasePrice: number | null; seller: string | null; returnDeadline: string | null }): Promise<Asset>` — criação manual, sem documento, sem `coverage` associada (diferente de `createAssetFromDocument`).
- [x] Adicionar `updateAsset(assetId: string, params: Partial<Omit<Asset, 'id' | 'user_id' | 'created_at'>>): Promise<Asset>`.
- [x] Adicionar `deleteAsset(assetId: string): Promise<void>` — `from('assets').delete().eq('id', assetId)`; cascade no schema já elimina `coverage`/`maintenance`/`claims` associados.
- [x] Adicionar `createCoverage(params: { assetId: string; type: CoverageType; provider: string | null; startDate: string | null; endDate: string | null }): Promise<CoverageRecord>` — criação de cobertura sem passar por `createAssetFromDocument` (asset já existe).
- [x] Adicionar `updateCoverage(coverageId: string, params: Partial<{ type: CoverageType; provider: string | null; start_date: string | null; end_date: string | null }>): Promise<CoverageRecord>`.
- [x] Adicionar `deleteCoverage(coverageId: string): Promise<void>`.
- [x] Adicionar `fetchMaintenanceForAsset(assetId: string): Promise<Maintenance[]>` — ordenado por `date desc`.
- [x] Adicionar `createMaintenance(params: { assetId: string; date: string | null; description: string | null; cost: number | null }): Promise<Maintenance>`.
- [x] Adicionar `deleteMaintenance(maintenanceId: string): Promise<void>`.
- [x] Adicionar `fetchClaimsForAsset(assetId: string): Promise<Claim[]>` — ordenado por `date desc`.
- [x] Adicionar `createClaim(params: { assetId: string; coverageId: string | null; date: string | null; description: string | null; status: ClaimStatus }): Promise<Claim>`.
- [x] Adicionar `updateClaim(claimId: string, params: Partial<{ status: ClaimStatus; result: string | null }>): Promise<Claim>` — usado para mover uma claim de `open` para `approved`/`denied`/`resolved` e registar `result`.
- [x] Adicionar `deleteClaim(claimId: string): Promise<void>`.
- [x] Importar `Maintenance`, `Claim`, `ClaimStatus` de `@/types/assets`.

**Nota:** `createAssetFromDocument`, `fetchAssets`, `fetchCoverageForAsset`, `fetchCoverageForUser`, `fetchDocumentsWithoutAsset`, `mapDocumentTypeToCoverageType` ficam inalterados — o F04 continua a funcionar sem tocar nestas funções.

---

### `src/lib/insights.ts`

**Modificações:**
- [x] Importar `expiringSeverity` de `@/lib/rulesEngine`; importar `CoverageExpiringInsightData`, `ReturnDeadlineInsightData` de `@/types/insights`; importar `fetchMaintenanceForAsset`/`fetchClaimsForAsset` **não** são necessários aqui (insights só olham para `assets`/`coverage`).
- [x] Refactorizar o bloco de `renewal` em `generateInsightsForContract` (linhas 196-212) para usar `expiringSeverity(days)` em vez de `days <= 7 ? 'critical' : 'warning'` inline — comportamento idêntico, só remove duplicação.
- [x] Estender `fallbackMessage` com dois `if` novos:
  ```typescript
  if (type === 'coverage_expiring') {
    const d = data as CoverageExpiringInsightData;
    return `${d.assetName}: ${d.coverageType} coverage expires in ${d.daysUntilExpiry} days (${d.endDate}).`;
  }
  if (type === 'return_deadline') {
    const d = data as ReturnDeadlineInsightData;
    return `${d.assetName}: return window closes in ${d.daysUntilDeadline} days (${d.returnDeadline}).`;
  }
  ```
- [x] Adicionar função privada `upsertAssetScopedInsight` análoga a `upsertCoverageGapInsight`, mas parametrizada por `type` (`'coverage_expiring' | 'return_deadline'`) e sem `coverage_type` quando `type === 'return_deadline'`:
  ```typescript
  async function upsertAssetScopedInsight(params: {
    userId: string;
    assetId: string;
    type: 'coverage_expiring' | 'return_deadline';
    coverageType?: 'warranty' | 'insurance' | 'extension';
    severity: InsightSeverity;
    data: InsightData;
  }): Promise<Insight> {
    let message: string;
    try {
      message = await explainInsight(params.type, params.data);
    } catch {
      message = fallbackMessage(params.type, params.data);
    }

    const onConflict = params.coverageType ? 'asset_id,type,coverage_type' : 'asset_id,type';
    const { data, error } = await supabase
      .from('insights')
      .upsert(
        {
          user_id: params.userId,
          asset_id: params.assetId,
          coverage_type: params.coverageType ?? null,
          type: params.type,
          severity: params.severity,
          data: params.data,
          message,
        },
        { onConflict }
      )
      .select(INSIGHT_COLUMNS)
      .single();
    if (error || !data) throw new Error(`Could not save ${params.type} insight`);
    return data;
  }
  ```
- [x] Adicionar `generateCoverageExpiringInsights(userId: string): Promise<Insight[]>` — mesma estrutura de `generateCoverageGapInsights` (busca `fetchAssets`+`fetchCoverageForUser`, agrupa por `asset_id`), mas em vez de olhar para `gaps`, olha para `primary`:
  ```typescript
  export async function generateCoverageExpiringInsights(userId: string): Promise<Insight[]> {
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
      const { primary } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
      if (!primary || primary.status !== 'expiring_soon' || !primary.end_date) continue;
      const days = daysUntil(primary.end_date);
      const data: CoverageExpiringInsightData = {
        assetName: asset.name,
        coverageType: primary.type,
        provider: primary.provider,
        endDate: primary.end_date,
        daysUntilExpiry: days,
      };
      created.push(
        await upsertAssetScopedInsight({
          userId,
          assetId: asset.id,
          type: 'coverage_expiring',
          coverageType: primary.type,
          severity: expiringSeverity(days),
          data,
        })
      );
    }
    return created;
  }
  ```
- [x] Adicionar `generateReturnDeadlineInsights(userId: string): Promise<Insight[]>`:
  ```typescript
  export async function generateReturnDeadlineInsights(userId: string): Promise<Insight[]> {
    const assets = await fetchAssets(userId);
    const created: Insight[] = [];
    for (const asset of assets) {
      if (!asset.return_deadline || !isExpiringSoon(asset.return_deadline, RENEWAL_THRESHOLD_DAYS)) continue;
      const days = daysUntil(asset.return_deadline);
      const data: ReturnDeadlineInsightData = {
        assetName: asset.name,
        returnDeadline: asset.return_deadline,
        daysUntilDeadline: days,
      };
      created.push(
        await upsertAssetScopedInsight({
          userId,
          assetId: asset.id,
          type: 'return_deadline',
          severity: expiringSeverity(days),
          data,
        })
      );
    }
    return created;
  }
  ```
- [x] `filterInsightsByBucket`: estender o ramo `'coverage'`:
  ```typescript
  if (filter === 'coverage')
    return insights.filter((i) => i.type === 'coverage_gap' || i.type === 'coverage_expiring' || i.type === 'return_deadline');
  ```

---

### `supabase/functions/explain-insight/index.ts`

**Modificações:**
- [x] Adicionar interfaces novas ao Deno file:
  ```typescript
  interface CoverageExpiringBody {
    type: 'coverage_expiring';
    assetName: string;
    coverageType: 'warranty' | 'insurance' | 'extension';
    provider: string | null;
    endDate: string;
    daysUntilExpiry: number;
  }

  interface ReturnDeadlineBody {
    type: 'return_deadline';
    assetName: string;
    returnDeadline: string;
    daysUntilDeadline: number;
  }
  ```
- [x] `RequestBody`: adicionar `| CoverageExpiringBody | ReturnDeadlineBody`
- [x] `EXPLAIN_SYSTEM_PROMPT`: adicionar duas linhas antes de "Tone:":
  ```
  For "coverage_expiring": state the asset name, the coverage type (warranty, insurance or extension) and how many days until it expires, using the exact numbers given.
  For "return_deadline": state the asset name and how many days remain to return it, using the exact numbers given.
  ```

---

### `src/lib/events.ts`

**Modificações — generalização mínima, sem tocar `fetchUpcomingBillRenewals`/`ContractRenewalEvent`/`joinEventsWithContracts` (usados por `bills.tsx`, ficam exactamente como estão):**

- [x] Importar `fetchAssets, fetchCoverageForUser` de `@/lib/coverage`; `evaluateCoverage` de `@/lib/rulesEngine`; `Asset` de `@/types/assets`; `CoverageType` de `@/types/coverage`.
- [x] Adicionar `syncAssetLifeEvents(userId: string, assets: Asset[], coverageByAsset: Map<string, CoverageRecord[]>): Promise<void>` — para cada asset, se `primary.status === 'expiring_soon'` faz upsert de um evento `type: 'expiry'` (`source_id: asset.id`, `due_date: primary.end_date`); se `asset.return_deadline` e `isExpiringSoon(asset.return_deadline)`, upsert de `type: 'deadline'` (`source_id: asset.id`, `due_date: asset.return_deadline`). Um único `upsert` com as linhas concatenadas, `onConflict: 'source_id,type'` (mesmo padrão de `syncRenewalEvents`).
- [x] Adicionar tipo novo:
  ```typescript
  export type LifeCalendarEntry =
    | { event: LifeEvent; source: 'contract'; contract: Contract }
    | { event: LifeEvent; source: 'asset_coverage'; asset: Asset; coverageType: CoverageType }
    | { event: LifeEvent; source: 'asset_return_deadline'; asset: Asset };
  ```
- [x] Adicionar `joinLifeCalendarEvents(events: LifeEvent[], contracts: Contract[], assets: Asset[], coverageByAsset: Map<string, CoverageRecord[]>): LifeCalendarEntry[]` — para cada `event`, resolve por `event.type`:
  - `'renewal'` → procura em `contracts` por `id === source_id`, entra como `{ source: 'contract', contract }`
  - `'expiry'` → procura em `assets` por `id === source_id`; recalcula `evaluateCoverage(coverageByAsset.get(asset.id) ?? []).primary` para obter `coverageType`; entra como `{ source: 'asset_coverage', asset, coverageType: primary.type }`
  - `'deadline'` → procura em `assets` por `id === source_id`; entra como `{ source: 'asset_return_deadline', asset }`
  - Ignora eventos cuja entidade de origem já não existe (mesma tolerância de `joinEventsWithContracts` hoje).
- [x] Reescrever `fetchLifeCalendarEvents` para devolver `LifeCalendarEntry[]`:
  ```typescript
  export async function fetchLifeCalendarEvents(
    userId: string,
    windowDays: number = LIFE_CALENDAR_WINDOW_DAYS
  ): Promise<LifeCalendarEntry[]> {
    const [contracts, assets, coverage] = await Promise.all([
      fetchContracts(userId).then((cs) => cs.filter((c) => c.renewal_date !== null)),
      fetchAssets(userId),
      fetchCoverageForUser(),
    ]);
    const coverageByAsset = new Map<string, CoverageRecord[]>();
    for (const record of coverage) {
      const list = coverageByAsset.get(record.asset_id) ?? [];
      list.push(record);
      coverageByAsset.set(record.asset_id, list);
    }
    await Promise.all([
      syncRenewalEvents(userId, contracts),
      syncAssetLifeEvents(userId, assets, coverageByAsset),
    ]);
    const events = await fetchUpcomingEvents(userId, windowDays);
    return joinLifeCalendarEvents(events, contracts, assets, coverageByAsset);
  }
  ```
- [x] Reescrever `groupEventsByDate` para trabalhar sobre `LifeCalendarEntry[]` em vez de `ContractRenewalEvent[]` (a assinatura muda, mas a lógica de agrupar por `event.due_date` é idêntica — só o tipo genérico muda).

**Nota:** `CoverageRecord` precisa de ser importado de `@/types/coverage` neste ficheiro (ainda não é).

---

### `src/components/dashboard/LifeCalendar.tsx`

**Modificações:**
- [x] `Props.entries: LifeCalendarEntry[]` (import de `@/lib/events`) em vez de `ContractRenewalEvent[]`.
- [x] Dentro de `group.entries.map(...)`, fazer `switch (entry.source)` (ou `if`/`else if`) para escolher o texto de cada linha:
  ```typescript
  {group.entries.map((entry) => (
    <Text key={entry.event.id} style={styles.row}>
      {entry.source === 'contract'
        ? `${entry.contract.provider} — renews in ${daysUntil(entry.event.due_date as string)} days`
        : entry.source === 'asset_coverage'
          ? `${entry.asset.name} — ${entry.coverageType} expires in ${daysUntil(entry.event.due_date as string)} days`
          : `${entry.asset.name} — return window closes in ${daysUntil(entry.event.due_date as string)} days`}
    </Text>
  ))}
  ```
- [x] Texto de estado vazio: manter "No renewals in the next 60 days." → alterar para "Nothing due in the next 60 days." (já não é só renewals).

### `src/components/dashboard/InsightCard.tsx`

**Modificações:**
- [x] `TYPE_LABELS`: adicionar `coverage_expiring: 'Coverage expiring'` e `return_deadline: 'Return deadline'` (TypeScript obriga, por ser `Record<InsightType, string>` exaustivo).

### `app/(dashboard)/alerts.tsx`

**Modificações:**
- [x] Importar `generateCoverageExpiringInsights`, `generateReturnDeadlineInsights` de `@/lib/insights`.
- [x] Importar `LifeCalendarEntry` de `@/lib/events` (substitui `ContractRenewalEvent` neste ficheiro).
- [x] `calendarEntries` state: `useState<LifeCalendarEntry[] | null>(null)`.
- [x] Em `load()`, antes do `Promise.all`, correr os três geradores em paralelo:
  ```typescript
  await Promise.all([
    generateCoverageGapInsights(user.id),
    generateCoverageExpiringInsights(user.id),
    generateReturnDeadlineInsights(user.id),
  ]);
  ```

### `app/(dashboard)/bills.tsx`

**Sem alterações.** `fetchUpcomingBillRenewals`/`ContractRenewalEvent` mantêm-se — confirmar depois de `/implement` que `tsc --noEmit` não acusa nada aqui (não deve, dado que nenhum tipo consumido por este ficheiro muda).

### `app/(dashboard)/_layout.tsx`

**Modificações:**
- [x] Adicionar `<Tabs.Screen name="assets" options={{ title: 'Assets' }} />` (sugestão de posição: a seguir a `coverage`, antes de `bills` — mantém agrupamento temático "protecção" junto).

---

## Ficheiros a Criar

### `src/components/assets/AssetForm.tsx`
**Propósito:** formulário único reutilizado para criar (`createAsset`) e editar (`updateAsset`) um asset — modo controlado por prop `mode: 'create' | 'edit'` e `initialAsset?: Asset`.
**Conteúdo:**
- Campos: `Input` para `name`, `brand`, `model`, `serial_number`, `seller`, `purchase_date`, `purchase_price` (numeric via `keyboardType="decimal-pad"`), `return_deadline`; `AssetCategorySelector` reutilizado de `src/components/coverage/`.
- Botões `Cancel`/`Save` (padrão de `CreateAssetFromDocumentForm.tsx`), `error`/`saving` state idêntico.
- `onSaved: (asset: Asset) => void`, `onCancelled: () => void`.

### `src/components/assets/AssetListItem.tsx`
**Propósito:** linha da lista em `app/(dashboard)/assets/index.tsx`.
**Conteúdo:**
- `Pressable` que navega para `/assets/[id]` (via `router.push`), mostra `asset.name`, `asset.category`, e um `Badge` de estado (`evaluateCoverage` sobre a cobertura do asset — reaproveita o mesmo padrão de `CoverageResult`; requer que a lista de assets venha com coverage já carregada ou que o item receba `records: CoverageRecord[]` como prop).

### `src/components/assets/CoverageForm.tsx`
**Propósito:** criar/editar um registo de `coverage` dentro da vista de detalhe do asset (fora do fluxo do Coverage Check).
**Conteúdo:**
- Reutiliza `CoverageTypeSelector` (`src/components/coverage/`) já existente para `type`.
- `Input` para `provider`, `start_date`, `end_date`.
- `mode: 'create' | 'edit'`, chama `createCoverage`/`updateCoverage` de `src/lib/coverage.ts`.

### `src/components/assets/MaintenanceForm.tsx`
**Propósito:** formulário de registo de manutenção.
**Conteúdo:** `Input` para `date`, `description`, `cost` (opcional); chama `createMaintenance`.

### `src/components/assets/MaintenanceList.tsx`
**Propósito:** lista de manutenções de um asset, com botão eliminar por linha (`Alert.alert` de confirmação → `deleteMaintenance`).

### `src/components/assets/ClaimForm.tsx`
**Propósito:** formulário de registo de claim.
**Conteúdo:** `Input` para `date`, `description`; selector de `status` (`ChipRow<ClaimStatus>`, reutilizando `src/components/ui/ChipRow.tsx`); opcionalmente `coverage_id` (selector simples sobre as `coverage` do asset, pode ser omitido no v1 do formulário — campo fica `null` se não seleccionado); chama `createClaim`.

### `src/components/assets/ClaimList.tsx`
**Propósito:** lista de claims de um asset. Cada linha mostra `Badge` com `status` (tone: `open`→`info`, `approved`→`success`, `denied`→`critical`, `resolved`→`success`) e, se existir, `result`. Botão eliminar (`Alert.alert` → `deleteClaim`).

### `app/(dashboard)/assets/index.tsx`
**Propósito:** lista de todos os assets do utilizador + entrada para criar um novo (sem depender de documento).
**Conteúdo:**
- `useFocusEffect` → `fetchAssets(user.id)` (+ `fetchCoverageForUser()` para os badges de estado, agrupado por `asset_id` como já é feito em `insights.ts`/`events.ts`).
- Estado vazio: texto + botão "Add asset" que abre `AssetForm mode="create"` inline (sem modal, seguindo o padrão de `coverage.tsx`/`CreateAssetFromDocumentForm` que aparecem inline na mesma scroll view).
- Lista via `AssetListItem` por asset.
- Ao criar, `router.push('/assets/' + asset.id)` para ir direto à vista de detalhe (mesmo padrão de UX que `CoverageScreen.handleAssetCreated`).

### `app/(dashboard)/assets/[id].tsx`
**Propósito:** vista de detalhe do asset — Purchase, Invoice, Coverage, Maintenance, Claims, numa vista só.
**Conteúdo:**
- `useLocalSearchParams<{ id: string }>()` para o `id` (primeira utilização deste hook na codebase — confirmar import de `expo-router`).
- `useFocusEffect` → `Promise.all([fetchAssetById(id), fetchCoverageForAsset(id), fetchDocumentForAsset(id), fetchMaintenanceForAsset(id), fetchClaimsForAsset(id)])`.
- Secções, cada uma com título e conteúdo:
  - **Purchase**: `brand`/`model`/`serial_number`/`purchase_date`/`purchase_price`/`seller` — texto simples, com botão "Edit" que troca a secção por `AssetForm mode="edit"`.
  - **Invoice**: se `fetchDocumentForAsset` devolver algo, mostrar `provider`/`date`/`amount` do documento; senão, "No invoice linked."
  - **Coverage**: lista de `CoverageRecord` (usa `Badge` com `getCoverageStatus` por registo, não só o `primary`), cada linha com "Edit"/"Delete"; botão "Add coverage" abre `CoverageForm mode="create"`. Se `asset.return_deadline` existir, mostrar como uma linha adicional (não é um `CoverageRecord`, é só um campo do asset) com o mesmo `Badge`/`getCoverageStatus`.
  - **Maintenance**: `MaintenanceList` + botão "Add maintenance" → `MaintenanceForm`.
  - **Claims**: `ClaimList` + botão "Add claim" → `ClaimForm`.
  - Botão "Delete asset" no fundo do ecrã, com `Alert.alert` de confirmação (menciona que elimina coverage/maintenance/claims associados) → `deleteAsset` → `router.back()`.

---

## Fases de Implementação

### Fase 1: Schema — `supabase/schema.sql`
**Ficheiros:** modificar `supabase/schema.sql` (ver secção acima).
**Critérios de sucesso (automáticos):**
- [x] SQL aplica-se sem erro num projecto Supabase local/remoto (`supabase db push` ou execução manual no SQL editor)
**Critérios de sucesso (manuais):**
- [x] `select * from information_schema.columns where table_name = 'assets'` mostra `seller`/`return_deadline`
- [x] `maintenance`/`claims` existem com RLS activa (`select relrowsecurity from pg_class where relname in ('maintenance','claims')` → `true`)

### Fase 2: Tipos — `src/types/assets.ts`, `src/types/insights.ts`
**Ficheiros:** modificar os dois ficheiros (ver secção acima).
**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa (os tipos novos ainda não são consumidos em lado nenhum, não deve haver erro)

### Fase 3: Rules engine + CRUD lib — `src/lib/rulesEngine.ts`, `src/lib/coverage.ts`
**Ficheiros:** modificar os dois ficheiros.
**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa
**Critérios de sucesso (manuais):**
- [x] Chamar `createAsset`/`updateAsset`/`deleteAsset`/`createCoverage`/`updateCoverage`/`deleteCoverage`/`createMaintenance`/`deleteMaintenance`/`createClaim`/`updateClaim`/`deleteClaim` a partir de uma consola/script ad-hoc contra o Supabase de dev confirma RLS e FKs correctos (eliminar um asset elimina `coverage`/`maintenance`/`claims` associados)

### Fase 4: Insights — `src/lib/insights.ts`, `supabase/functions/explain-insight/index.ts`
**Ficheiros:** modificar os dois ficheiros; deploy da edge function (`supabase functions deploy explain-insight`).
**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa
**Critérios de sucesso (manuais):**
- [x] Criar um asset com `coverage.end_date` a 10 dias → `generateCoverageExpiringInsights` cria um insight `severity: 'critical'`, mensagem coerente (via LLM ou fallback se a function falhar)
- [x] Criar um asset com `return_deadline` a 20 dias → `generateReturnDeadlineInsights` cria um insight `severity: 'warning'`
- [x] Correr o gerador duas vezes seguidas para o mesmo asset → só existe uma linha em `insights` (idempotência via `onConflict`)

### Fase 5: Life Calendar — `src/lib/events.ts`, `src/components/dashboard/LifeCalendar.tsx`, `src/components/dashboard/InsightCard.tsx`, `app/(dashboard)/alerts.tsx`
**Ficheiros:** modificar os quatro ficheiros.
**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa (incluindo `app/(dashboard)/bills.tsx`, que não deve precisar de alterações)
**Critérios de sucesso (manuais):**
- [x] Tab Alerts: um asset com cobertura a expirar em breve aparece em "Next 60 days" ao lado de renewals de contratos, com o texto correcto por `source`
- [x] Tab Bills: `RenewalTimeline`/`renewals` continuam a funcionar sem alterações visíveis (regressão do F08/F05)
- [x] `InsightCard` mostra o label correcto para `coverage_expiring`/`return_deadline` na lista de Alerts

### Fase 6: UI do Warranty Vault — componentes novos + ecrãs + navegação
**Ficheiros:** criar todos os ficheiros de `src/components/assets/` e `app/(dashboard)/assets/`; modificar `app/(dashboard)/_layout.tsx`.
**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa
- [x] `expo lint` passa sem warnings novos (2 erros pré-existentes e não relacionados permanecem em `app/(auth)/login.tsx` e `app/onboarding/step3.tsx`)
**Critérios de sucesso (manuais):**
- [x] Tab "Assets" visível e navegável
- [x] Estado vazio (sem assets) mostra opção de criar asset manualmente, sem exigir documento prévio
- [x] Criar um asset manual → aparece na lista → abre vista de detalhe
- [x] Vista de detalhe mostra Purchase/Invoice/Coverage/Maintenance/Claims; "Invoice" mostra "No invoice linked." para um asset criado manualmente
- [x] Editar asset, editar/eliminar coverage, adicionar maintenance, adicionar/editar claim — todos persistem e recarregam correctamente ao voltar ao ecrã (`useFocusEffect`)
- [x] Eliminar asset pede confirmação e remove o asset (e os seus registos associados) da lista
- [x] Coverage Check (tab "Coverage") continua a funcionar sem regressão — criar asset via `CreateAssetFromDocumentForm` e fazer o Coverage Check normalmente

---

## Estratégia de Testes

- **Unit:** nenhum framework de testes configurado na codebase actual (confirmar antes de assumir Jest/Vitest — se não existir, os critérios de sucesso automáticos ficam limitados a `tsc --noEmit`/`expo lint`, como nas fases acima).
- **Manual:** correr `expo start`, testar no simulador iOS (ou Expo Go) o fluxo completo: criar asset manual → adicionar coverage a expirar em breve → confirmar insight em Alerts → confirmar evento em Life Calendar → editar/eliminar coverage → adicionar maintenance/claim → eliminar asset. Repetir o fluxo original do Coverage Check (F04) para confirmar zero regressão.

## Notas de Implementação

- **Determinismo:** nenhuma das duas novas funções de insight (`generateCoverageExpiringInsights`, `generateReturnDeadlineInsights`) chama o LLM para decidir severidade ou datas — só para a frase final (`explainInsight`), com `fallbackMessage` determinístico como rede de segurança, exactamente como o resto de `insights.ts`.
- **RLS:** `maintenance`/`claims` seguem o padrão indirecto de `coverage` (via `assets.user_id`), nunca `user_id` directo — evita duplicar a coluna e mantém uma única fonte de verdade de posse (o asset).
- **Risco principal:** a generalização de `src/lib/events.ts`/`LifeCalendar.tsx` (Fase 5) é o ponto de maior probabilidade de regressão no F08 já em produção — testar a tab Bills (`fetchUpcomingBillRenewals`, intocado) e a tab Alerts (`fetchLifeCalendarEvents`, reescrito) separadamente antes de avançar para a Fase 6.
- **`useLocalSearchParams`/rota dinâmica** (`app/(dashboard)/assets/[id].tsx`) é a primeira rota dinâmica da app — confirmar que o Expo Router regista a rota correctamente (`expo-doctor` ou apenas navegação manual) antes de construir o resto da Fase 6 em cima dela.
- **Sem extracção automática de maintenance/claims via Vision LLM** — fora de escopo (ver ticket, `## Fora do escopo`). Todos os formulários desta ficha são manuais.
- **`coverage_id` em `claims`** é opcional (`on delete set null`) — uma claim pode existir sem estar ligada a um registo de `coverage` específico (ex: reclamação directa ao vendedor fora de warranty/insurance formal).

## Referências

- Research: `thoughts/shared/research/2026-09-15-warranty-vault.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-warranty-vault.md`
- Padrão de upsert idempotente de insight: `src/lib/insights.ts:104-135` (`upsertCoverageGapInsight`)
- Padrão de RLS indirecta via asset: `supabase/schema.sql:113-139` (`coverage`)
- Padrão de formulário create/edit inline: `src/components/coverage/CreateAssetFromDocumentForm.tsx`
- Padrão de evento com `source_id` genérico: `src/lib/events.ts:12-19` (`syncRenewalEvents`)
