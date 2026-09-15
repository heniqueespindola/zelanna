---
data: 2026-09-15
feature: "Warranty Vault (F10)"
status: completo
---

# Research: Warranty Vault (F10)

## Questão de Pesquisa

Que forma mínima de schema (`return_deadline`, `maintenance`, `claims`) e que generalização mínima de `src/lib/events.ts` (hoje acoplado a `Contract`) permitem satisfazer os alertas automáticos de warranty/return-deadline e a vista de detalhe do asset pedidos no ticket `thoughts/shared/tickets/2026-09-15-warranty-vault.md`, sem reescrever o Life Calendar (F08) já em produção nem duplicar o CRUD já existente em `src/lib/coverage.ts` (F04)?

## Sumário

O F04 (Coverage Check) já construiu `assets`/`coverage` no schema com RLS completo, e um caminho de criação mínimo (`createAssetFromDocument`), mas **não existe nenhum CRUD de edição/eliminação em nenhuma tabela da app** — o padrão `.delete()` não aparece em nenhum ficheiro de `src/lib/`. O tipo `EventType` (`'renewal' | 'expiry' | 'deadline'`) já antecipa warranty-expiry (`'expiry'`) e return-deadline (`'deadline'`), mas só `'renewal'` está implementado; `src/lib/events.ts` está inteiramente acoplado a `Contract` (`ContractRenewalEvent`, `joinEventsWithContracts`) e precisa de generalização para aceitar eventos de origem `assets`/`coverage`. O padrão de insight determinístico + explicação LLM (`saveInsight`/`upsertCoverageGapInsight` em `src/lib/insights.ts` + a edge function `explain-insight`, que usa uma união discriminada fechada por `type`) é directamente replicável para os dois novos tipos de alerta, mas exige tocar três camadas em sincronia: `InsightType`/`InsightData` (TS), `fallbackMessage`/nova função geradora (lib), e o `RequestBody`/system prompt da edge function (Deno).

## Ficheiros Relevantes da Codebase

- `supabase/schema.sql:69-139` — tabelas `assets` e `coverage` já existem com RLS completo; `assets` não tem `seller`/`return_deadline`; não há `maintenance`/`claims`
- `supabase/schema.sql:141-142` — `documents.asset_id` já liga um documento a um asset (usado para "Invoice" na vista de detalhe)
- `supabase/schema.sql:239-253` — `insights` já tem `asset_id`, `coverage_type` e um índice único parcial `insights_coverage_gap_unique` (`asset_id, type, coverage_type` where `asset_id is not null`) usado pelo padrão de upsert idempotente
- `supabase/schema.sql:255-263` — `events` já tem `type` genérico (comentário: `'renewal' | 'expiry' | 'deadline'`) e `source_id` genérico (comentário: "referência a contracts/coverage/assets"), com `unique(source_id, type)` — desenhado para múltiplas origens, mas só usado por `contracts` hoje
- `src/lib/coverage.ts` — `fetchAssets`, `fetchCoverageForAsset`, `fetchCoverageForUser`, `fetchDocumentsWithoutAsset`, `createAssetFromDocument`; **sem** `updateAsset`/`deleteAsset`/`updateCoverage`/`deleteCoverage`/criação manual sem documento
- `src/lib/rulesEngine.ts:18-56` — `getCoverageStatus`, `evaluateCoverage` (com `COVERAGE_TYPE_RANK`), `coverageGapSeverity` — motor determinístico já reutilizável para warranty/return-deadline, sem alterações necessárias à assinatura
- `src/lib/insights.ts:104-169` — `upsertCoverageGapInsight`/`generateCoverageGapInsights`: padrão de upsert idempotente sobre `evaluateCoverage(...).gaps`, mas **`gaps` só cobre `missing`/`expired`** — o estado `expiring_soon` nunca chega a `insights` hoje, só é mostrado em runtime pelo `CoverageResult`
- `src/lib/insights.ts:171-215` — `generateInsightsForContract`: padrão de referência para "renewal em breve" (severidade `warning` dentro do threshold, `critical` nos últimos 7 dias) — modelo directo a replicar para warranty/return-deadline
- `src/lib/events.ts` — inteiramente acoplado a `Contract`: `syncRenewalEvents(userId, contracts: Contract[])`, `ContractRenewalEvent { event, contract }`, `joinEventsWithContracts(events, contracts)`; `fetchLifeCalendarEvents`/`fetchUpcomingBillRenewals` chamam sempre `fetchContracts` primeiro
- `src/components/dashboard/LifeCalendar.tsx` — consome `ContractRenewalEvent[]` directamente e acede a `contract.provider` — quebra se a união de eventos não incluir sempre um `contract`
- `src/components/dashboard/InsightCard.tsx` — `TYPE_LABELS: Record<InsightType, string>` é um mapa exaustivo por `InsightType` — adicionar um `InsightType` novo obriga TypeScript a pedir a entrada correspondente aqui (protecção "grátis" contra esquecer o label)
- `src/components/dashboard/AlertsFilter.tsx` + `src/types/insights.ts:65` (`AlertsFilter = 'all' | 'coverage' | 'bills' | 'renewal'`) — filtro de buckets na tab Alerts; decidir se os dois insights novos entram no bucket `'coverage'` existente ou exigem opção nova
- `app/(dashboard)/alerts.tsx` — chama `generateCoverageGapInsights(user.id)` a cada `useFocusEffect`; qualquer gerador novo de insight de warranty/return-deadline segue o mesmo padrão de chamada
- `app/(dashboard)/coverage.tsx` + `src/components/coverage/*` (`AssetSelector`, `AssetCategorySelector`, `CoverageTypeSelector`, `CreateAssetFromDocumentForm`, `CoverageResult`) — todos os componentes de UI para assets/coverage vivem aqui; não existe pasta `src/components/assets/` nem `app/(dashboard)/assets/`
- `src/components/ui/{Input,Button,Badge,ChipRow}.tsx` — primitivas reutilizáveis (form fields, botão com loading/disabled, badge por `tone`, chip selector genérico `ChipRow<T>`) — nenhum componente de lista/tabela genérico existe ainda
- `src/types/assets.ts`, `src/types/coverage.ts`, `src/types/events.ts`, `src/types/insights.ts` — tipos actuais; nenhum tem `seller`, `return_deadline`, `maintenance`, `claims`
- `supabase/functions/explain-insight/index.ts` — união discriminada `RequestBody` fechada por `type`, com um bloco dedicado no `EXPLAIN_SYSTEM_PROMPT` por tipo; adicionar um `InsightType` novo implica estender ambos em sincronia com `src/types/insights.ts`/`src/lib/insights.ts`

## Padrões de Implementação Existentes

**Upsert idempotente de insight ligado a um asset** (evita duplicar o mesmo alerta em execuções sucessivas do `useFocusEffect`):

```typescript
// src/lib/insights.ts:104-135
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

**Severidade em duas camadas por proximidade da data** (referência directa para warranty/return-deadline expiring-soon):

```typescript
// src/lib/insights.ts:196-212
if (contract.renewal_date && isExpiringSoon(contract.renewal_date, RENEWAL_THRESHOLD_DAYS)) {
  const days = daysUntil(contract.renewal_date);
  created.push(
    await saveInsight({
      userId,
      contractId: contract.id,
      type: 'renewal',
      severity: days <= 7 ? 'critical' : 'warning',
      data: { provider: contract.provider, renewalDate: contract.renewal_date, daysUntilRenewal: days },
    })
  );
}
```

**RLS por relação indirecta (asset-scoped), padrão a replicar em `maintenance`/`claims`:**

```sql
-- supabase/schema.sql:113-118
create policy "Users can view own coverage"
  on public.coverage for select
  using (exists (
    select 1 from public.assets
    where assets.id = coverage.asset_id and assets.user_id = auth.uid()
  ));
-- (repetido para insert/update/delete, trocando "for select"/"using" por "for insert"/"with check", etc.)
```

**Evento com `source_id` genérico e upsert por `(source_id, type)`** — já pensado para múltiplas origens, hoje só chamado para `contracts`:

```typescript
// src/lib/events.ts:12-19
export async function syncRenewalEvents(userId: string, contracts: Contract[]): Promise<void> {
  const rows = contracts
    .filter((c) => c.renewal_date !== null)
    .map((c) => ({ user_id: userId, type: 'renewal' as const, due_date: c.renewal_date, source_id: c.id }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('events').upsert(rows, { onConflict: 'source_id,type' });
  if (error) throw new Error('Could not sync renewal events');
}
```

**Chip selector genérico já extraído** (`ChipRow<T>`), usado por `AlertsFilter`, reutilizável para qualquer selector novo (ex: tipo de maintenance, estado de claim):

```typescript
// src/components/ui/ChipRow.tsx
export function ChipRow<T>({ options, value, onChange }: Props<T>) { /* ... */ }
```

**Mapa exaustivo por `InsightType`** (força tratar todos os tipos ao adicionar um novo — útil como checklist):

```typescript
// src/components/dashboard/InsightCard.tsx
const TYPE_LABELS: Record<InsightType, string> = {
  price_increase: 'Price increase',
  renewal: 'Renewal',
  anomaly: 'Anomaly',
  recurring_increase: 'Recurring increase',
  coverage_gap: 'Coverage gap',
};
```

## Tabelas/Queries Supabase Relevantes

- **`assets`** (`supabase/schema.sql:69-98`): `id, user_id, name, category, brand, model, serial_number, purchase_date, purchase_price, created_at`. RLS por `user_id` directo. Falta: `seller`, campo para return deadline.
- **`coverage`** (`supabase/schema.sql:100-139`): `id, asset_id, type, provider, start_date, end_date, status (não usado), created_at`. RLS via `exists(...assets.user_id = auth.uid())`. `type` é `'warranty' | 'insurance' | 'extension'` — nenhum valor para "return window".
- **`documents`**: já tem `asset_id`, `contract_id`, `bill_id` (colunas opcionais adicionadas por `alter table` sucessivos) — o documento de origem de um asset (a "Invoice" na vista de detalhe) já é consultável via `documents.asset_id = <asset.id>`, sem precisar de nova coluna.
- **`insights`** (`supabase/schema.sql:177-253`): `id, user_id, contract_id, bill_id, asset_id, coverage_type, type, severity, data, message, resolved_at, created_at`. Já suporta `asset_id`/`coverage_type` (usados por `coverage_gap`); o índice único `insights_coverage_gap_unique` está *scoped* a `type` fixo via a definição do índice (`where asset_id is not null`, sem filtrar por `type`), pelo que decidir em `/plan` se o novo tipo reutiliza este índice (teria de garantir unicidade também por `type`) ou precisa de índice próprio.
- **`events`** (`supabase/schema.sql:255-263`): `id, user_id, type, due_date, source_id, created_at`, `unique(source_id, type)`. `type` já é `'renewal' | 'expiry' | 'deadline'` por comentário/schema — **`'expiry'` e `'deadline'` nunca foram usados na prática**, mas a coluna já os permite sem migração. `source_id` é `uuid` solto, sem foreign key — a app decide o que significa por convenção (hoje sempre um `contracts.id`).
- **Tabelas que faltam para esta ficha:** `maintenance` e `claims`, ambas provavelmente `asset_id uuid references assets(id) on delete cascade` + RLS idêntica à de `coverage` (padrão acima). Nenhuma migration ou draft existente para estas duas.
- **Nenhuma tabela tem soft-delete ou histórico de edição** — qualquer `update`/`delete` novo segue o padrão simples já usado (`documents.update({asset_id: ...})`, `insights.update({resolved_at: ...})`), sem padrão de auditoria a replicar.

## APIs Externas Relevantes

- **Edge Function `explain-insight`** (`supabase/functions/explain-insight/index.ts`): invocada via `supabase.functions.invoke('explain-insight', { body: { type, ...data } })`. `RequestBody` é uma união discriminada por `type`, fechada — adicionar `warranty_expiring`/`return_deadline` (nomes por decidir em `/plan`) implica: (1) nova interface de body em Deno, (2) adicionar a `RequestBody` union, (3) adicionar um parágrafo dedicado ao `EXPLAIN_SYSTEM_PROMPT` descrevendo como frasear esse tipo, nunca recalculando números. Usa `claude-sonnet-5` via Anthropic Messages API directamente (`x-api-key` do `ANTHROPIC_API_KEY`, variável de servidor). Falha (network/4xx/5xx) já tem fallback local (`fallbackMessage` em `src/lib/insights.ts`), portanto a UX não fica bloqueada se a explicação falhar — só perde a frase mais natural.
- **Vision LLM de extracção** (`supabase/functions/extract-document`, `src/lib/extraction.ts`): não relevante a esta ficha — Warranty Vault regista maintenance/claims manualmente (ver `## Fora do escopo` do ticket); mencionado aqui apenas porque a vista de detalhe do asset precisa de mostrar o documento de origem já extraído (`documents.extracted_data`), sem nova chamada à API.
- Nenhuma API externa nova é necessária para esta ficha (sem Stripe, sem Gmail).

## Code Snippets de Referência

**`CoverageResult` já resolve "primary coverage" e "gaps" a partir de `evaluateCoverage`** — é o consumidor mais próximo do que a vista de detalhe do asset (F10) vai precisar de mostrar, apenas estendido com maintenance/claims/purchase/invoice:

```typescript
// src/components/coverage/CoverageResult.tsx
const { primary, gaps } = evaluateCoverage(records);
// primary: (CoverageRecord & { type, status }) | null — status: 'active' | 'expiring_soon' | 'expired'
// gaps: { type: 'warranty' | 'insurance'; reason: 'missing' | 'expired'; end_date: string | null }[]
```

**`createAssetFromDocument` mostra o único caminho de escrita composta hoje (asset + coverage + link ao documento numa única função)** — modelo a seguir para uma futura `createAssetManually` (sem o passo de `documents.update`):

```typescript
// src/lib/coverage.ts:52-90 (resumido)
export async function createAssetFromDocument(params: {...}): Promise<{ asset: Asset; coverage: CoverageRecord }> {
  const { data: asset } = await supabase.from('assets').insert({ user_id, name, category, purchase_date: startDate, purchase_price: purchaseAmount }).select(ASSET_COLUMNS).single();
  const { data: coverage } = await supabase.from('coverage').insert({ asset_id: asset.id, type: coverageType, provider, start_date: startDate, end_date: endDate }).select(COVERAGE_COLUMNS).single();
  await supabase.from('documents').update({ asset_id: asset.id }).eq('id', documentId);
  return { asset, coverage };
}
```

**`fetchLifeCalendarEvents`/`ContractRenewalEvent` — ponto exacto a generalizar** para incluir warranty/return-deadline no Life Calendar sem reescrever `LifeCalendar.tsx` do zero:

```typescript
// src/lib/events.ts:56-64
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
Qualquer generalização precisa de decidir se `ContractRenewalEvent` vira uma união (`{ event, source: 'contract', contract } | { event, source: 'asset', asset, coverage? }`) consumida por um `LifeCalendar` adaptado, ou se se mantém uma lista separada fundida antes de chegar ao componente — ambas as opções tocam `src/components/dashboard/LifeCalendar.tsx`, que hoje acede directamente a `contract.provider`.

## Questões em Aberto

- **Onde vive `return_deadline`?** Coluna nova em `assets` (um valor por asset, mais simples) vs. registo novo em `coverage` com um `type` adicional (reaproveita `evaluateCoverage`/`getCoverageStatus` sem alterações, mas obriga a estender `CoverageType` e a UI do Coverage Check para não misturar "return deadline" com "estás protegido"). Não decidido pela pesquisa — é uma decisão de `/plan`.
- **O índice único `insights_coverage_gap_unique`** (`asset_id, type, coverage_type` where `asset_id is not null`) não filtra por um `type` fixo na definição do índice — precisa de confirmação em `/plan` se um novo `type` de insight sobre o mesmo `asset_id`/`coverage_type` colide com este índice (parece que sim, dado que o índice não inclui `type='coverage_gap'` como condição) ou se precisa de índice próprio por tipo.
- **`AlertsFilter`/`AlertsFilter` type (`'all' | 'coverage' | 'bills' | 'renewal'`)**: os dois insights novos entram no bucket `'coverage'` (semanticamente relacionado a asset/coverage) ou justificam um bucket próprio? Não há sinal forte no código actual — decisão de produto/UX para `/plan`.
- **Estrutura de `maintenance`/`claims`**: nenhum precedente no schema para campos mínimos (nome dos campos, se `claims` referencia `coverage_id` opcionalmente). O ticket já lista campos hipotéticos (data, descrição, custo para maintenance; data, descrição, estado, resultado para claims) mas isso não foi validado contra nenhum padrão existente — é definição nova, não descoberta.
- **Local do CRUD**: estender `src/lib/coverage.ts` (arriscando um ficheiro a crescer para além do padrão de ficheiros pequenos do `CLAUDE.md`) vs. criar `src/lib/assets.ts` dedicado, reexportando ou duplicando `ASSET_COLUMNS`. Não há precedente de "split" de lib no código actual (cada domínio tem um único ficheiro `lib/<dominio>.ts`) — sugere que `src/lib/assets.ts` seria mais consistente com o padrão (`bills.ts`, `contracts.ts`, `events.ts`, `insights.ts` são todos ficheiros de domínio únicos), mas fica por decidir se "asset" e "coverage" contam como o mesmo domínio ou dois.
- **Nenhum padrão de "editar"/"eliminar" existe em lado nenhum da app hoje** (confirmado por grep — só há `.insert()`, `.select()` e um punhado de `.update()` para ligar FKs ou marcar `resolved_at`). O `/plan` desta ficha é o primeiro a introduzir eliminação de registos na aplicação — vale a pena decidir explicitamente o padrão de UX (confirmação antes de eliminar? soft delete?) já que não há nada a copiar.
