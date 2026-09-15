---
data: 2026-09-15
feature: "Coverage Check (F04)"
research: "thoughts/shared/research/2026-09-15-coverage-check.md"
status: completo
---

# Spec: Coverage Check (F04)

## Visão Geral

Cria as tabelas `assets`/`coverage` (schema completo do `CLAUDE.md`, RLS por dono), um fluxo mínimo "criar asset a partir de um documento já carregado", e substitui o placeholder `app/(dashboard)/coverage.tsx` por um ecrã que selecciona um asset e mostra o seu estado de cobertura (`covered` / `expiring soon` / `not covered`) calculado 100% em runtime a partir de `daysUntil`/`isExpiringSoon`.

## Decisões tomadas (resolvendo as questões em aberto do research)

- **`coverage.status` nunca é lido/escrito pela app.** A coluna existe no schema SQL só por paridade com o `CLAUDE.md`, mas o estado é sempre calculado em runtime via `getCoverageStatus()` — evita ficar desactualizado sem job/trigger.
- **`assets` usa o schema completo do `CLAUDE.md`** (incluindo `brand`, `model`, `serial_number` mesmo sem UI para os editar nesta ficha) para evitar uma segunda migração quando o F10 chegar. A UI desta ficha só expõe `name`, `category`, `purchase_date` (via `start_date` do documento) e `purchase_price` (via `amount` extraído).
- **RLS de `coverage` via subquery a `assets`** (sem denormalizar `user_id` em `coverage`) — mantém o schema alinhado com o `CLAUDE.md`.
- **Criação de asset a partir de documento vive inline em `coverage.tsx`**, seguindo o mesmo padrão de estado (`'idle' | 'creating' | ...`) que `DocumentUpload.tsx` usa para `'previewing'` — sem rota/modal nova.
- **`documents.asset_id`** (nullable, `references assets(id) on delete set null`) é adicionado para ligar o documento de origem ao asset criado.
- **Cor de confirmação:** `colors.success = '#4A7856'` — novo tom de verde, mais vivo que `colors.primary` (`#324138`), adicionado a `src/constants/theme.ts`.
- **Entrypoint de criação de asset só aparece no estado vazio** (sem assets) — não adicionar um "+ add asset" quando já existem assets, para não antecipar o CRUD completo do F10 (fora do escopo do ticket). Isto é uma limitação conhecida a documentar, não a resolver aqui.
- **Sem transacção atómica entre `assets`/`coverage`/`documents.asset_id`.** O Supabase client não expõe transacções multi-tabela sem uma função RPC dedicada; nesta ficha os três inserts/updates são sequenciais. Se o insert de `coverage` falhar depois do `assets` ter sido criado, fica um asset órfão sem cobertura — aceitável para o MVP, a resolver com uma RPC `create_asset_with_coverage` só se se tornar um problema real em uso.

## Ficheiros a Criar

### `src/types/assets.ts`
```ts
export type AssetCategory = 'electronics' | 'vehicle' | 'appliance' | 'other';

export interface Asset {
  id: string;
  user_id: string;
  name: string;
  category: AssetCategory | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  created_at: string;
}
```

### `src/types/coverage.ts`
```ts
export type CoverageType = 'warranty' | 'insurance' | 'extension';

export interface CoverageRecord {
  id: string;
  asset_id: string;
  type: CoverageType | null;
  provider: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}
```
Nota: propositadamente sem campo `status` — nunca seleccionado da BD (ver decisão acima).

### `src/lib/coverage.ts`
**Propósito:** única camada de acesso a `assets`/`coverage`/`documents` para esta ficha, seguindo o padrão de `src/lib/extraction.ts` (funções `async` isoladas, sem hook, chamadas directamente do componente).

```ts
import { supabase } from '@/lib/supabase';
import type { Asset, AssetCategory } from '@/types/assets';
import type { CoverageRecord, CoverageType } from '@/types/coverage';
import type { DocumentType, UploadedDocument } from '@/types/documents';

const ASSET_COLUMNS =
  'id, user_id, name, category, brand, model, serial_number, purchase_date, purchase_price, created_at';
const COVERAGE_COLUMNS = 'id, asset_id, type, provider, start_date, end_date, created_at';

export function mapDocumentTypeToCoverageType(docType: DocumentType | null): CoverageType | null {
  if (docType === 'warranty') return 'warranty';
  if (docType === 'insurance') return 'insurance';
  return null;
}

export async function fetchAssets(userId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load assets');
  return data ?? [];
}

export async function fetchCoverageForAsset(assetId: string): Promise<CoverageRecord[]> {
  const { data, error } = await supabase
    .from('coverage')
    .select(COVERAGE_COLUMNS)
    .eq('asset_id', assetId);
  if (error) throw new Error('Could not load coverage');
  return data ?? [];
}

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

export async function createAssetFromDocument(params: {
  userId: string;
  documentId: string;
  name: string;
  category: AssetCategory | null;
  coverageType: CoverageType;
  provider: string | null;
  startDate: string | null;
  endDate: string | null;
  purchaseAmount: number | null;
}): Promise<{ asset: Asset; coverage: CoverageRecord }> {
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .insert({
      user_id: params.userId,
      name: params.name,
      category: params.category,
      purchase_date: params.startDate,
      purchase_price: params.purchaseAmount,
    })
    .select(ASSET_COLUMNS)
    .single();
  if (assetError || !asset) throw new Error('Could not create asset');

  const { data: coverage, error: coverageError } = await supabase
    .from('coverage')
    .insert({
      asset_id: asset.id,
      type: params.coverageType,
      provider: params.provider,
      start_date: params.startDate,
      end_date: params.endDate,
    })
    .select(COVERAGE_COLUMNS)
    .single();
  if (coverageError || !coverage) throw new Error('Could not create coverage record');

  await supabase.from('documents').update({ asset_id: asset.id }).eq('id', params.documentId);

  return { asset, coverage };
}
```

### `src/components/ui/Badge.tsx`
**Propósito:** primeiro componente `Badge` genérico do projecto (listado na estrutura de pastas do `CLAUDE.md` mas nunca criado) — reutilizável por F05/F06/F08 mais tarde.
```tsx
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export type BadgeTone = 'success' | 'warning' | 'critical' | 'info';

interface Props {
  label: string;
  tone: BadgeTone;
}

const TONE_COLOR: Record<BadgeTone, string> = {
  success: colors.success,
  warning: colors.warning,
  critical: colors.critical,
  info: colors.info,
};

export function Badge({ label, tone }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: TONE_COLOR[tone] }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});
```

### `src/components/coverage/AssetSelector.tsx`
Cópia estrutural de `src/components/documents/DocumentTypeSelector.tsx` (mesmo padrão de chips controlados, sem estado interno), adaptada para `Asset[]`:
- Props: `{ assets: Asset[]; value: string | null; onChange: (assetId: string) => void }`
- Renderiza um chip por asset (`asset.name`), mesmo estilo `chip`/`chipSelected`/`chipUnselected` do ficheiro original.

### `src/components/coverage/AssetCategorySelector.tsx`
Mesmo padrão de chips, opções fixas:
```ts
const OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'other', label: 'Other' },
];
```
Props: `{ value: AssetCategory | null; onChange: (v: AssetCategory) => void }` (opcional — sem opção "nenhuma", se o utilizador não tocar fica `null`).

### `src/components/coverage/CoverageTypeSelector.tsx`
Mesmo padrão de chips, opções fixas:
```ts
const OPTIONS: { value: CoverageType; label: string }[] = [
  { value: 'warranty', label: 'Warranty' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'extension', label: 'Extension' },
];
```
Props: `{ value: CoverageType; onChange: (v: CoverageType) => void }` (sempre um valor seleccionado, pré-preenchido por `mapDocumentTypeToCoverageType`).

### `src/components/coverage/CreateAssetFromDocumentForm.tsx`
**Propósito:** promove um `UploadedDocument` já carregado a `Asset` + `CoverageRecord`, seguindo o padrão de `DocumentPreviewForm.tsx` (formulário controlado, pré-preenchido a partir de dados já conhecidos, `Confirm`/`Cancel`, `<150` linhas).

Props:
```ts
interface Props {
  userId: string;
  document: UploadedDocument;
  onCreated: (asset: Asset) => void;
  onCancelled: () => void;
}
```

Estado inicial:
- `name = ''` (sem candidato nos dados extraídos — placeholder `"e.g. MacBook Pro"`)
- `category: AssetCategory | null = null`
- `coverageType: CoverageType = mapDocumentTypeToCoverageType(document.document_type) ?? 'warranty'`
- `provider = document.provider ?? ''`
- `startDate = document.date ?? ''`
- `endDate = document.expiry_date ?? ''`
- `saving`, `error`

`handleConfirm`:
- Valida `name.trim()` não vazio → `setError('Asset name is required.')` e aborta se vazio
- Chama `createAssetFromDocument({ userId, documentId: document.id, name: name.trim(), category, coverageType, provider: provider.trim() || null, startDate: startDate.trim() || null, endDate: endDate.trim() || null, purchaseAmount: document.amount })`
- `onCreated(asset)` no sucesso; `setError('Could not create this asset. Please try again.')` no erro

Render: `Input` (name), `AssetCategorySelector`, `CoverageTypeSelector`, `Input` (provider), `Input` (start date), `Input` (end date), erro opcional, `Button` "Cancel" (`onPress={onCancelled}`) + `Button` "Confirm" variant `accent` (`onPress={handleConfirm}`) — mesmo layout/estilos (`styles.card`, `styles.title`, `styles.buttons`) de `DocumentPreviewForm.tsx`.

### `src/components/coverage/CoverageCheckForm.tsx`
**Propósito:** selecção de asset **ou** estado vazio com caminho de criação — cumpre o critério de aceitação explícito do ticket ("Componentes `CoverageCheckForm` e `CoverageResult` criados").

Props:
```ts
interface Props {
  userId: string;
  assets: Asset[];
  documentsWithoutAsset: UploadedDocument[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  onAssetCreated: (asset: Asset) => void;
}
```

Estado interno: `creatingFromDocument: UploadedDocument | null`.

Lógica de render:
- Se `assets.length === 0`:
  - Texto: `"You don't have any assets yet."`
  - Se `documentsWithoutAsset.length === 0`: texto `"Upload a warranty or insurance document in Documents to get started."` (sem CTA accionável — não há documento para promover)
  - Senão: texto `"Create an asset from one of your documents:"` + lista de `Pressable` (um por documento — mostrar `document.provider ?? document.document_type ?? 'Untitled document'`), `onPress` → `setCreatingFromDocument(doc)`
  - Se `creatingFromDocument`: renderiza `CreateAssetFromDocumentForm` com `onCreated={(asset) => { setCreatingFromDocument(null); onAssetCreated(asset); }}` e `onCancelled={() => setCreatingFromDocument(null)}`
- Senão (`assets.length > 0`): renderiza `AssetSelector` com `assets`, `selectedAssetId`, `onSelectAsset`

### `src/components/coverage/CoverageResult.tsx`
**Propósito:** mostra o resultado de cobertura de um asset, usando `evaluateCoverage` de `rulesEngine.ts` — nenhum cálculo de datas acontece neste ficheiro.

Props: `{ asset: Asset; records: CoverageRecord[] }`

```ts
function gapMessage(gap: CoverageEvaluation['gaps'][number]): string {
  const label = gap.type === 'warranty' ? 'warranty' : 'insurance';
  if (gap.reason === 'missing') return `No ${label} on file for this asset.`;
  return `Your ${label} expired on ${gap.end_date}.`;
}

function nextActionText(primary: NonNullable<CoverageEvaluation['primary']>): string | null {
  if (!primary.end_date) return null;
  if (primary.status === 'expiring_soon') {
    return `Renew with ${primary.provider ?? 'your provider'} by ${primary.end_date}.`;
  }
  return `Renews on ${primary.end_date}.`;
}
```

Render:
- `Text` — `asset.name` (heading)
- `const { primary, gaps } = evaluateCoverage(records);`
- Se `primary`: `<Badge label={primary.status === 'expiring_soon' ? 'Expiring soon' : 'Covered'} tone={primary.status === 'expiring_soon' ? 'warning' : 'success'} />`, texto com `provider` (`primary.provider ?? 'Unknown provider'`), se `primary.status === 'expiring_soon'` mostrar também `${daysUntil(primary.end_date!)} days left`, e o texto de `nextActionText(primary)`
- Se `!primary`: `<Badge label="Not covered" tone="critical" />`
- Para cada `gap` em `gaps`: `<Text>{gapMessage(gap)}</Text>`

## Ficheiros a Modificar

### `src/constants/theme.ts`
- [ ] Adicionar `success: '#4A7856',` à secção "Severidade de alertas" (junto a `info`/`warning`/`critical`)

### `src/lib/rulesEngine.ts`
- [ ] Adicionar import: `import type { CoverageRecord, CoverageType } from '@/types/coverage';`
- [ ] Adicionar, depois de `isExpiringSoon`:
```ts
export type CoverageStatus = 'active' | 'expiring_soon' | 'expired';

export function getCoverageStatus(endDateISO: string | null, thresholdDays: number = 30): CoverageStatus {
  if (!endDateISO) return 'active';
  const days = daysUntil(endDateISO);
  if (days < 0) return 'expired';
  if (days <= thresholdDays) return 'expiring_soon';
  return 'active';
}

const COVERAGE_TYPE_RANK: Record<CoverageType, number> = { extension: 3, insurance: 2, warranty: 1 };

export interface CoverageEvaluation {
  primary: (CoverageRecord & { type: CoverageType; status: CoverageStatus }) | null;
  gaps: { type: 'warranty' | 'insurance'; reason: 'missing' | 'expired'; end_date: string | null }[];
}

export function evaluateCoverage(records: CoverageRecord[], thresholdDays: number = 30): CoverageEvaluation {
  const withStatus = records
    .filter((r): r is CoverageRecord & { type: CoverageType } => r.type !== null)
    .map((r) => ({ ...r, status: getCoverageStatus(r.end_date, thresholdDays) }));

  const inForce = withStatus.filter((r) => r.status !== 'expired');

  const primary = inForce.length
    ? [...inForce].sort((a, b) => {
        const rank = COVERAGE_TYPE_RANK[b.type] - COVERAGE_TYPE_RANK[a.type];
        if (rank !== 0) return rank;
        const aTime = a.end_date ? new Date(a.end_date).getTime() : Infinity;
        const bTime = b.end_date ? new Date(b.end_date).getTime() : Infinity;
        return bTime - aTime;
      })[0]
    : null;

  const gaps: CoverageEvaluation['gaps'] = [];
  for (const type of ['warranty', 'insurance'] as const) {
    const recordsOfType = withStatus.filter((r) => r.type === type);
    const hasInForce = recordsOfType.some((r) => r.status !== 'expired');
    if (hasInForce) continue;
    const mostRecentExpired = recordsOfType[0] ?? null;
    gaps.push({ type, reason: mostRecentExpired ? 'expired' : 'missing', end_date: mostRecentExpired?.end_date ?? null });
  }

  return { primary, gaps };
}
```

### `src/types/documents.ts`
- [ ] Adicionar `asset_id: string | null;` à interface `UploadedDocument` (depois de `id`)

### `app/(dashboard)/coverage.tsx`
Substituir o placeholder completo por um ecrã com estado local (padrão de `DocumentUpload.tsx`, sem hook novo — não há reutilização suficiente noutro ecrã para justificar um Context):

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchAssets, fetchCoverageForAsset, fetchDocumentsWithoutAsset } from '@/lib/coverage';
import { CoverageCheckForm } from '@/components/coverage/CoverageCheckForm';
import { CoverageResult } from '@/components/coverage/CoverageResult';
import type { Asset } from '@/types/assets';
import type { CoverageRecord } from '@/types/coverage';
import type { UploadedDocument } from '@/types/documents';

export default function CoverageScreen() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [documentsWithoutAsset, setDocumentsWithoutAsset] = useState<UploadedDocument[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [records, setRecords] = useState<CoverageRecord[] | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchAssets(user.id), fetchDocumentsWithoutAsset(user.id)]).then(
      ([loadedAssets, loadedDocuments]) => {
        setAssets(loadedAssets);
        setDocumentsWithoutAsset(loadedDocuments);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!selectedAssetId) { setRecords(null); return; }
    fetchCoverageForAsset(selectedAssetId).then(setRecords);
  }, [selectedAssetId]);

  const handleAssetCreated = (asset: Asset) => {
    setAssets((prev) => [asset, ...(prev ?? [])]);
    setDocumentsWithoutAsset((prev) => prev.filter((d) => d.id !== asset.id)); // ver nota abaixo
    setSelectedAssetId(asset.id);
  };

  const selectedAsset = assets?.find((a) => a.id === selectedAssetId) ?? null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coverage Check</Text>
      <Text style={styles.subtitle}>
        Select an asset to see if it's covered by a warranty or insurance.
      </Text>

      {assets === null || !user ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : (
        <CoverageCheckForm
          userId={user.id}
          assets={assets}
          documentsWithoutAsset={documentsWithoutAsset}
          selectedAssetId={selectedAssetId}
          onSelectAsset={setSelectedAssetId}
          onAssetCreated={handleAssetCreated}
        />
      )}

      {selectedAsset && records ? <CoverageResult asset={selectedAsset} records={records} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
```

**Nota sobre `handleAssetCreated`:** o filtro `documentsWithoutAsset.filter(d => d.id !== asset.id)` está errado (compara id de documento com id de asset) — a versão correcta precisa do `documentId` original. Ajustar `CoverageCheckForm`/`onAssetCreated` para passar `{ asset, documentId }` em vez de só `asset`, e filtrar por `d.id !== documentId`. **Implementador: usar a assinatura `onAssetCreated: (asset: Asset, documentId: string) => void` em vez da acima — este é o único ponto da spec com um erro a corrigir durante `/implement`.**

### `supabase/schema.sql`
Acrescentar ao fim do ficheiro (mesmo padrão incremental dos commits "Feature 1/2/3"):

```sql
create table if not exists public.assets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  category text,             -- 'electronics' | 'vehicle' | 'appliance' | 'other'
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_price numeric,
  created_at timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "Users can view own assets"
  on public.assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own assets"
  on public.assets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own assets"
  on public.assets for update
  using (auth.uid() = user_id);

create policy "Users can delete own assets"
  on public.assets for delete
  using (auth.uid() = user_id);

create table if not exists public.coverage (
  id uuid default gen_random_uuid() primary key,
  asset_id uuid references public.assets(id) on delete cascade,
  type text,                 -- 'warranty' | 'insurance' | 'extension'
  provider text,
  start_date date,
  end_date date,
  status text,               -- não usado pela app (calculado em runtime, ver rulesEngine.ts)
  created_at timestamptz not null default now()
);

alter table public.coverage enable row level security;

create policy "Users can view own coverage"
  on public.coverage for select
  using (exists (
    select 1 from public.assets
    where assets.id = coverage.asset_id and assets.user_id = auth.uid()
  ));

create policy "Users can insert own coverage"
  on public.coverage for insert
  with check (exists (
    select 1 from public.assets
    where assets.id = coverage.asset_id and assets.user_id = auth.uid()
  ));

create policy "Users can update own coverage"
  on public.coverage for update
  using (exists (
    select 1 from public.assets
    where assets.id = coverage.asset_id and assets.user_id = auth.uid()
  ));

create policy "Users can delete own coverage"
  on public.coverage for delete
  using (exists (
    select 1 from public.assets
    where assets.id = coverage.asset_id and assets.user_id = auth.uid()
  ));

alter table public.documents
  add column if not exists asset_id uuid references public.assets(id) on delete set null;
```

## Fases de Implementação

### Fase 1: Schema — desbloqueia todo o resto
**Ficheiros:**
- Modificar `supabase/schema.sql` (bloco acima)

**Critérios de sucesso (automáticos):**
- [ ] Nenhum — SQL aplicado manualmente no SQL editor do Supabase (sem CLI de migrations, conforme padrão do projecto)

**Critérios de sucesso (manuais):**
- [ ] `assets` e `coverage` existem no Supabase com RLS activo (`select * from pg_policies where tablename in ('assets','coverage')` devolve as 8 policies)
- [ ] `documents.asset_id` existe e aceita `null`

### Fase 2: Tipos
**Ficheiros:**
- Criar `src/types/assets.ts`
- Criar `src/types/coverage.ts`
- Modificar `src/types/documents.ts` (`asset_id`)

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros

### Fase 3: Motor de regras + tema
**Ficheiros:**
- Modificar `src/lib/rulesEngine.ts` (`getCoverageStatus`, `evaluateCoverage`)
- Modificar `src/constants/theme.ts` (`colors.success`)

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros

**Critérios de sucesso (manuais):**
- [ ] `evaluateCoverage([])` devolve `{ primary: null, gaps: [{type:'warranty',reason:'missing',...}, {type:'insurance',reason:'missing',...}] }` (testar manualmente numa consola/REPL ou teste ad-hoc — sem framework de testes configurado no projecto)
- [ ] Uma cobertura `insurance` com `end_date` a 10 dias devolve `primary.status === 'expiring_soon'`
- [ ] Uma cobertura `warranty` expirada + nenhuma `insurance` devolve `gaps` com `warranty: reason 'expired'` e `insurance: reason 'missing'`

### Fase 4: Camada de dados
**Ficheiros:**
- Criar `src/lib/coverage.ts`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros

### Fase 5: Componentes UI
**Ficheiros:**
- Criar `src/components/ui/Badge.tsx`
- Criar `src/components/coverage/AssetSelector.tsx`
- Criar `src/components/coverage/AssetCategorySelector.tsx`
- Criar `src/components/coverage/CoverageTypeSelector.tsx`
- Criar `src/components/coverage/CreateAssetFromDocumentForm.tsx`
- Criar `src/components/coverage/CoverageCheckForm.tsx`
- Criar `src/components/coverage/CoverageResult.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run lint` sem warnings
- [ ] Todos os ficheiros `<150` linhas

### Fase 6: Ecrã
**Ficheiros:**
- Modificar `app/(dashboard)/coverage.tsx`
- Ajustar `CoverageCheckForm.onAssetCreated` para `(asset: Asset, documentId: string) => void` (ver nota na secção "Ficheiros a Modificar")

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run lint` sem warnings

**Critérios de sucesso (manuais):**
- [ ] Utilizador sem assets e sem documentos → vê mensagem a pedir upload em Documents, sem CTA quebrado
- [ ] Utilizador sem assets mas com 1+ documentos → vê lista de documentos, consegue seleccionar um, preencher `CreateAssetFromDocumentForm`, e ao confirmar o asset aparece seleccionado com o resultado de cobertura visível
- [ ] Utilizador com 1+ assets → vê `AssetSelector`, consegue trocar de asset e o `CoverageResult` actualiza
- [ ] Asset com seguro activo (>30 dias) → badge verde "Covered", texto "Renews on {data}"
- [ ] Asset com garantia a expirar em 10 dias → badge dourado "Expiring soon", "10 days left", "Renew with {provider} by {data}"
- [ ] Asset sem nenhuma cobertura → badge crítico "Not covered" + duas linhas de gap (warranty e insurance em falta)
- [ ] Asset com warranty expirada e sem insurance → gap "Your warranty expired on {data}." + gap "No insurance on file for this asset."

## Estratégia de Testes

- **Unit:** não há framework de testes configurado no projecto (`package.json` sem `jest`/`vitest`) — `evaluateCoverage`/`getCoverageStatus` são funções puras fáceis de testar mais tarde se um framework for introduzido; por agora, validar manualmente com valores de exemplo (Fase 3).
- **Manual:** critérios da Fase 6 acima, no simulador iOS/Android via `expo start`.

## Notas de Implementação

- Separação estrita entre cálculo determinístico (`evaluateCoverage`/`getCoverageStatus` em `rulesEngine.ts`) e apresentação (`CoverageResult.tsx` só formata strings a partir do resultado já calculado) — nenhum componente UI faz aritmética de datas directamente, conforme `CLAUDE.md` regra #6.
- `coverage.status` (coluna SQL) nunca é lida nem escrita pela app — ver "Decisões tomadas".
- Threshold de "expiring soon" mantém o default de `isExpiringSoon`/`getCoverageStatus` (30 dias) — não introduzir um segundo valor hardcoded no componente.
- `AssetSelector`, `AssetCategorySelector`, `CoverageTypeSelector` são deliberadamente três componentes quase idênticos (cópias do padrão de `DocumentTypeSelector`) em vez de um selector genérico parametrizado — consistente com o resto da codebase, que ainda não tem abstração de chip-selector; não introduzir essa abstração nesta ficha.
- Limitação conhecida e aceite: depois de criado o primeiro asset, não há UI para adicionar um segundo (sem CTA fora do estado vazio) — está fora do escopo deste ticket (CRUD completo é o F10) e não deve ser resolvida aqui.

## Referências

- Research: `thoughts/shared/research/2026-09-15-coverage-check.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-coverage-check.md`
- Padrão de hook/fetch: `src/hooks/useOnboarding.tsx:25-45`
- Padrão de formulário de preview: `src/components/documents/DocumentPreviewForm.tsx`
- Padrão de máquina de estados inline: `src/components/documents/DocumentUpload.tsx:16-39`
- Padrão de chip selector: `src/components/documents/DocumentTypeSelector.tsx`
