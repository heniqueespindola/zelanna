---
data: 2026-09-15
feature: "Digital Estate (F11)"
research: "thoughts/shared/research/2026-09-15-digital-estate.md"
status: completo
---

# Spec: Digital Estate (F11)

## Visão Geral

Cria o modelo de dados e a UI de gestão owner-side do Digital Estate: 5 tabelas novas (`digital_assets`, `financial_assets`, `trusted_people`, `trusted_person_permissions`, `estate_access_log`, `estate_instructions` — 6 no total), extensão não destrutiva de `documents` (`is_estate_document` + dois `document_type` novos), CRUD em `src/lib/estate.ts` seguindo a convenção de `src/lib/coverage.ts`, e um ecrã novo `app/(dashboard)/estate/` acessível a partir de Settings (não é uma 8ª tab). **Não constrói** nenhum mecanismo real de autenticação/acesso de terceiros — isso fica explicitamente fora de escopo (ver ticket).

## Decisões tomadas nesta spec

Todas as questões deixadas em aberto pelo ticket/research foram decididas aqui, com justificação:

1. **Mecanismo de acesso real da trusted person (opção a vs b): não é construído nesta ficha.** O ticket já exclui isto em "Fora do escopo". `trusted_person_permissions` e `estate_access_log` usam RLS owner-only (padrão join-ao-pai, como `coverage`/`maintenance`/`claims`) — só o dono lê/escreve. Quando o mecanismo real (recomendação da research: opção b, conta Supabase própria da trusted person) for construído numa ficha futura, a policy de `insert` de `estate_access_log` deve ser substituída por uma RPC `SECURITY DEFINER` chamada pela sessão da própria trusted person — documentado inline no schema como comentário.
2. **Audit log populado manualmente/simulado nesta fase**: `estate_access_log` aceita `insert` do dono (não só `service_role`), ao contrário do padrão de `gmail_connections`. Isto é intencional — hoje só o dono pode gerar uma entrada (não existe sessão de terceiro), por isso um botão "Log test view" no ecrã de detalhe da trusted person insere uma linha simulada. Isto dá ao schema a forma final (`trusted_person_id`, `section`, `accessed_at`) sem exigir migração quando o acesso real existir.
3. **"Important documents" = extensão aditiva dupla**: (a) `DocumentType` ganha `'will'` e `'certificate'` (útil para a extracção da Vision LLM classificar estes documentos automaticamente); (b) `documents` ganha uma coluna independente `is_estate_document boolean default false`, porque o ticket identifica explicitamente que um documento de qualquer tipo (ex: um recibo) pode ser relevante para o estate — usar só o `document_type` não cobriria esse caso.
4. **Instructions = tabela dedicada `estate_instructions`**, uma linha por `user_id` (não por trusted person) — o texto é escrito uma vez pelo dono; o acesso por trusted person é controlado separadamente via `trusted_person_permissions.section = 'instructions'`, nunca um campo replicado por pessoa.
5. **Navegação: sub-ecrã, não 8ª tab.** A app já tem 7 tabs. `app/(dashboard)/estate/` é registado no `Tabs` com `options={{ href: null }}` (esconde da tab bar, mantém a rota navegável via `router.push`), com uma entrada "Manage Digital Estate" adicionada a `app/(dashboard)/settings.tsx`.
6. **Permissões = presença/ausência de linha**, nunca um booleano. `grantPermission`/`revokePermission` = `insert`/`delete` em `trusted_person_permissions`. Isto implementa directamente a regra do `CLAUDE.md`: "nunca expor tudo a um trusted person por defeito".

---

## Ficheiros a Modificar

### `supabase/schema.sql`

- [ ] Depois do bloco `alter table public.documents add column if not exists bill_id ...` (linha ~320-321), adicionar:
  ```sql
  alter table public.documents
    add column if not exists is_estate_document boolean not null default false;
  ```
- [ ] Actualizar o comentário do `document_type` na criação de `documents` (linha 40) para: `-- 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt' | 'will' | 'certificate'` (sem alteração de valor — coluna `text` sem CHECK constraint, só documentação).
- [ ] No fim do ficheiro (depois do bloco `gmail_import_items`, linha 421), adicionar as 6 tabelas novas:
  ```sql
  create table if not exists public.digital_assets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade,
    name text not null,
    type text,                    -- 'domain' | 'website' | 'social_account' | 'youtube' | 'online_business' | 'digital_ip' | 'crypto_account' | 'other'
    location text,                -- onde está registado/alojado (ex: 'GoDaddy', 'Google account')
    credentials_location text,    -- onde as credenciais estão guardadas (nunca a credencial em si)
    notes text,
    created_at timestamptz not null default now()
  );

  alter table public.digital_assets enable row level security;

  create policy "Users can view own digital assets"
    on public.digital_assets for select
    using (auth.uid() = user_id);

  create policy "Users can insert own digital assets"
    on public.digital_assets for insert
    with check (auth.uid() = user_id);

  create policy "Users can update own digital assets"
    on public.digital_assets for update
    using (auth.uid() = user_id);

  create policy "Users can delete own digital assets"
    on public.digital_assets for delete
    using (auth.uid() = user_id);

  create table if not exists public.financial_assets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade,
    name text not null,
    type text,                    -- 'bank' | 'investment' | 'pension' | 'insurance' | 'crypto' | 'property' | 'other'
    institution text,
    notes text,
    created_at timestamptz not null default now()
  );

  alter table public.financial_assets enable row level security;

  create policy "Users can view own financial assets"
    on public.financial_assets for select
    using (auth.uid() = user_id);

  create policy "Users can insert own financial assets"
    on public.financial_assets for insert
    with check (auth.uid() = user_id);

  create policy "Users can update own financial assets"
    on public.financial_assets for update
    using (auth.uid() = user_id);

  create policy "Users can delete own financial assets"
    on public.financial_assets for delete
    using (auth.uid() = user_id);

  create table if not exists public.trusted_people (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade,
    name text not null,
    relationship text,
    email text,
    phone text,
    status text not null default 'active',   -- 'active' | 'revoked'
    created_at timestamptz not null default now()
  );

  alter table public.trusted_people enable row level security;

  create policy "Users can view own trusted people"
    on public.trusted_people for select
    using (auth.uid() = user_id);

  create policy "Users can insert own trusted people"
    on public.trusted_people for insert
    with check (auth.uid() = user_id);

  create policy "Users can update own trusted people"
    on public.trusted_people for update
    using (auth.uid() = user_id);

  create policy "Users can delete own trusted people"
    on public.trusted_people for delete
    using (auth.uid() = user_id);

  create table if not exists public.trusted_person_permissions (
    id uuid default gen_random_uuid() primary key,
    trusted_person_id uuid references public.trusted_people(id) on delete cascade,
    section text not null,   -- 'digital_assets' | 'financial_assets' | 'important_documents' | 'assets' | 'coverage' | 'instructions'
    created_at timestamptz not null default now(),
    constraint trusted_person_permissions_unique unique (trusted_person_id, section)
  );

  alter table public.trusted_person_permissions enable row level security;

  create policy "Users can view own trusted person permissions"
    on public.trusted_person_permissions for select
    using (exists (
      select 1 from public.trusted_people
      where trusted_people.id = trusted_person_permissions.trusted_person_id and trusted_people.user_id = auth.uid()
    ));

  create policy "Users can insert own trusted person permissions"
    on public.trusted_person_permissions for insert
    with check (exists (
      select 1 from public.trusted_people
      where trusted_people.id = trusted_person_permissions.trusted_person_id and trusted_people.user_id = auth.uid()
    ));

  create policy "Users can delete own trusted person permissions"
    on public.trusted_person_permissions for delete
    using (exists (
      select 1 from public.trusted_people
      where trusted_people.id = trusted_person_permissions.trusted_person_id and trusted_people.user_id = auth.uid()
    ));

  -- Sem policy de update: uma permissão é concedida (insert) ou revogada (delete), nunca alterada.

  create table if not exists public.estate_access_log (
    id uuid default gen_random_uuid() primary key,
    trusted_person_id uuid references public.trusted_people(id) on delete cascade,
    section text not null,
    accessed_at timestamptz not null default now()
  );

  alter table public.estate_access_log enable row level security;

  create policy "Users can view own estate access log"
    on public.estate_access_log for select
    using (exists (
      select 1 from public.trusted_people
      where trusted_people.id = estate_access_log.trusted_person_id and trusted_people.user_id = auth.uid()
    ));

  -- Nesta fase não existe acesso real de trusted people (ver ficha F11, "Fora do escopo") —
  -- só o dono pode simular/registar uma visualização manualmente, daí a policy de insert
  -- também ser owner-side. Quando o mecanismo de acesso real for construído (conta própria
  -- da trusted person + segundo auth.uid(), ver research 2026-09-15-digital-estate.md),
  -- esta policy de insert deve ser substituída por uma RPC SECURITY DEFINER chamada pela
  -- própria trusted person.
  create policy "Users can insert own estate access log"
    on public.estate_access_log for insert
    with check (exists (
      select 1 from public.trusted_people
      where trusted_people.id = estate_access_log.trusted_person_id and trusted_people.user_id = auth.uid()
    ));

  create table if not exists public.estate_instructions (
    user_id uuid primary key references public.users(id) on delete cascade,
    content text not null default '',
    updated_at timestamptz not null default now()
  );

  alter table public.estate_instructions enable row level security;

  create policy "Users can view own estate instructions"
    on public.estate_instructions for select
    using (auth.uid() = user_id);

  create policy "Users can insert own estate instructions"
    on public.estate_instructions for insert
    with check (auth.uid() = user_id);

  create policy "Users can update own estate instructions"
    on public.estate_instructions for update
    using (auth.uid() = user_id);
  ```

### `src/types/documents.ts`

- [ ] `DocumentType`: `'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt' | 'will' | 'certificate'`
- [ ] `UploadedDocument`: adicionar `is_estate_document: boolean;`

### `supabase/functions/_shared/extraction.ts`

- [ ] Linha 2 (`ExtractedDocumentData.document_type`): adicionar `| 'will' | 'certificate'`
- [ ] Linha 15 (prosa do prompt): `"such as an invoice, warranty, insurance policy, contract, receipt, will or certificate"`
- [ ] Linha 18 (JSON schema do prompt): `"document_type": "invoice" | "warranty" | "insurance" | "contract" | "receipt" | "will" | "certificate" | null,`
- [ ] Depois de editar: `supabase functions deploy extract-document` (a function `extract-document` importa este shared file — confirmar o nome exacto do ficheiro que a importa antes do deploy).

### `src/components/documents/DocumentTypeSelector.tsx`

- [ ] `OPTIONS`: adicionar `{ value: 'will', label: 'Will' }` e `{ value: 'certificate', label: 'Certificate' }`.

### `app/(dashboard)/_layout.tsx`

- [ ] Adicionar `<Tabs.Screen name="estate" options={{ href: null }} />` (regista a rota sem a mostrar na tab bar — mesmo padrão documentado do Expo Router para "hidden tab").

### `app/(dashboard)/settings.tsx`

- [ ] Importar `useRouter` de `expo-router`.
- [ ] Adicionar, antes do `Button title="Log out"`, um `Button title="Manage Digital Estate" variant="primary" onPress={() => router.push('/estate')}`.

---

## Ficheiros a Criar

### `src/types/estate.ts`

```typescript
export type DigitalAssetType =
  | 'domain'
  | 'website'
  | 'social_account'
  | 'youtube'
  | 'online_business'
  | 'digital_ip'
  | 'crypto_account'
  | 'other';

export interface DigitalAsset {
  id: string;
  user_id: string;
  name: string;
  type: DigitalAssetType | null;
  location: string | null;
  credentials_location: string | null;
  notes: string | null;
  created_at: string;
}

export type FinancialAssetType =
  | 'bank'
  | 'investment'
  | 'pension'
  | 'insurance'
  | 'crypto'
  | 'property'
  | 'other';

export interface FinancialAsset {
  id: string;
  user_id: string;
  name: string;
  type: FinancialAssetType | null;
  institution: string | null;
  notes: string | null;
  created_at: string;
}

export type TrustedPersonStatus = 'active' | 'revoked';

export interface TrustedPerson {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  status: TrustedPersonStatus;
  created_at: string;
}

export type EstateSection =
  | 'digital_assets'
  | 'financial_assets'
  | 'important_documents'
  | 'assets'
  | 'coverage'
  | 'instructions';

export interface TrustedPersonPermission {
  id: string;
  trusted_person_id: string;
  section: EstateSection;
  created_at: string;
}

export interface EstateAccessLogEntry {
  id: string;
  trusted_person_id: string;
  section: EstateSection;
  accessed_at: string;
}

export interface EstateInstructions {
  user_id: string;
  content: string;
  updated_at: string;
}
```

### `src/lib/estate.ts`

CRUD completo seguindo a convenção de `src/lib/coverage.ts` (`*_COLUMNS` const, `throw new Error(...)` terso, params camelCase → insert/update snake_case):

```typescript
import { supabase } from '@/lib/supabase';
import type {
  DigitalAsset,
  DigitalAssetType,
  EstateAccessLogEntry,
  EstateInstructions,
  EstateSection,
  FinancialAsset,
  FinancialAssetType,
  TrustedPerson,
  TrustedPersonPermission,
  TrustedPersonStatus,
} from '@/types/estate';
import type { UploadedDocument } from '@/types/documents';

const DIGITAL_ASSET_COLUMNS = 'id, user_id, name, type, location, credentials_location, notes, created_at';
const FINANCIAL_ASSET_COLUMNS = 'id, user_id, name, type, institution, notes, created_at';
const TRUSTED_PERSON_COLUMNS = 'id, user_id, name, relationship, email, phone, status, created_at';
const PERMISSION_COLUMNS = 'id, trusted_person_id, section, created_at';
const ACCESS_LOG_COLUMNS = 'id, trusted_person_id, section, accessed_at';
const INSTRUCTIONS_COLUMNS = 'user_id, content, updated_at';

// Digital assets

export async function fetchDigitalAssets(userId: string): Promise<DigitalAsset[]> {
  const { data, error } = await supabase
    .from('digital_assets')
    .select(DIGITAL_ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load digital assets');
  return data ?? [];
}

export async function createDigitalAsset(params: {
  userId: string;
  name: string;
  type: DigitalAssetType | null;
  location: string | null;
  credentialsLocation: string | null;
  notes: string | null;
}): Promise<DigitalAsset> {
  const { data, error } = await supabase
    .from('digital_assets')
    .insert({
      user_id: params.userId,
      name: params.name,
      type: params.type,
      location: params.location,
      credentials_location: params.credentialsLocation,
      notes: params.notes,
    })
    .select(DIGITAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create digital asset');
  return data;
}

export async function updateDigitalAsset(
  id: string,
  params: Partial<Omit<DigitalAsset, 'id' | 'user_id' | 'created_at'>>
): Promise<DigitalAsset> {
  const { data, error } = await supabase
    .from('digital_assets')
    .update(params)
    .eq('id', id)
    .select(DIGITAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update digital asset');
  return data;
}

export async function deleteDigitalAsset(id: string): Promise<void> {
  const { error } = await supabase.from('digital_assets').delete().eq('id', id);
  if (error) throw new Error('Could not delete digital asset');
}

// Financial assets

export async function fetchFinancialAssets(userId: string): Promise<FinancialAsset[]> {
  const { data, error } = await supabase
    .from('financial_assets')
    .select(FINANCIAL_ASSET_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load financial assets');
  return data ?? [];
}

export async function createFinancialAsset(params: {
  userId: string;
  name: string;
  type: FinancialAssetType | null;
  institution: string | null;
  notes: string | null;
}): Promise<FinancialAsset> {
  const { data, error } = await supabase
    .from('financial_assets')
    .insert({
      user_id: params.userId,
      name: params.name,
      type: params.type,
      institution: params.institution,
      notes: params.notes,
    })
    .select(FINANCIAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create financial asset');
  return data;
}

export async function updateFinancialAsset(
  id: string,
  params: Partial<Omit<FinancialAsset, 'id' | 'user_id' | 'created_at'>>
): Promise<FinancialAsset> {
  const { data, error } = await supabase
    .from('financial_assets')
    .update(params)
    .eq('id', id)
    .select(FINANCIAL_ASSET_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update financial asset');
  return data;
}

export async function deleteFinancialAsset(id: string): Promise<void> {
  const { error } = await supabase.from('financial_assets').delete().eq('id', id);
  if (error) throw new Error('Could not delete financial asset');
}

// Trusted people

export async function fetchTrustedPeople(userId: string): Promise<TrustedPerson[]> {
  const { data, error } = await supabase
    .from('trusted_people')
    .select(TRUSTED_PERSON_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load trusted people');
  return data ?? [];
}

export async function fetchTrustedPersonById(id: string): Promise<TrustedPerson | null> {
  const { data, error } = await supabase
    .from('trusted_people')
    .select(TRUSTED_PERSON_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Could not load trusted person');
  return data;
}

export async function createTrustedPerson(params: {
  userId: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
}): Promise<TrustedPerson> {
  const { data, error } = await supabase
    .from('trusted_people')
    .insert({
      user_id: params.userId,
      name: params.name,
      relationship: params.relationship,
      email: params.email,
      phone: params.phone,
    })
    .select(TRUSTED_PERSON_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not create trusted person');
  return data;
}

export async function updateTrustedPerson(
  id: string,
  params: Partial<{ name: string; relationship: string | null; email: string | null; phone: string | null; status: TrustedPersonStatus }>
): Promise<TrustedPerson> {
  const { data, error } = await supabase
    .from('trusted_people')
    .update(params)
    .eq('id', id)
    .select(TRUSTED_PERSON_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update trusted person');
  return data;
}

export async function deleteTrustedPerson(id: string): Promise<void> {
  const { error } = await supabase.from('trusted_people').delete().eq('id', id);
  if (error) throw new Error('Could not delete trusted person');
}

// Permissions — presença de linha = acesso concedido; ausência = sem acesso.

export async function fetchPermissionsForTrustedPerson(trustedPersonId: string): Promise<TrustedPersonPermission[]> {
  const { data, error } = await supabase
    .from('trusted_person_permissions')
    .select(PERMISSION_COLUMNS)
    .eq('trusted_person_id', trustedPersonId);
  if (error) throw new Error('Could not load permissions');
  return data ?? [];
}

export async function grantPermission(trustedPersonId: string, section: EstateSection): Promise<TrustedPersonPermission> {
  const { data, error } = await supabase
    .from('trusted_person_permissions')
    .insert({ trusted_person_id: trustedPersonId, section })
    .select(PERMISSION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not grant permission');
  return data;
}

export async function revokePermission(trustedPersonId: string, section: EstateSection): Promise<void> {
  const { error } = await supabase
    .from('trusted_person_permissions')
    .delete()
    .eq('trusted_person_id', trustedPersonId)
    .eq('section', section);
  if (error) throw new Error('Could not revoke permission');
}

// Access log — populado manualmente/simulado nesta fase (ver Decisões tomadas #2)

export async function fetchAccessLogForTrustedPerson(trustedPersonId: string): Promise<EstateAccessLogEntry[]> {
  const { data, error } = await supabase
    .from('estate_access_log')
    .select(ACCESS_LOG_COLUMNS)
    .eq('trusted_person_id', trustedPersonId)
    .order('accessed_at', { ascending: false });
  if (error) throw new Error('Could not load access log');
  return data ?? [];
}

export async function logSimulatedAccess(trustedPersonId: string, section: EstateSection): Promise<EstateAccessLogEntry> {
  const { data, error } = await supabase
    .from('estate_access_log')
    .insert({ trusted_person_id: trustedPersonId, section })
    .select(ACCESS_LOG_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not log access');
  return data;
}

// Instructions

export async function fetchEstateInstructions(userId: string): Promise<EstateInstructions | null> {
  const { data, error } = await supabase
    .from('estate_instructions')
    .select(INSTRUCTIONS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Could not load instructions');
  return data;
}

export async function upsertEstateInstructions(userId: string, content: string): Promise<EstateInstructions> {
  const { data, error } = await supabase
    .from('estate_instructions')
    .upsert({ user_id: userId, content, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select(INSTRUCTIONS_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save instructions');
  return data;
}

// Important documents — reaproveita a tabela documents já existente

export async function fetchAllDocuments(userId: string): Promise<UploadedDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load documents');
  return data ?? [];
}

export async function fetchEstateDocuments(userId: string): Promise<UploadedDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('is_estate_document', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load estate documents');
  return data ?? [];
}

export async function setDocumentEstateFlag(documentId: string, isEstateDocument: boolean): Promise<UploadedDocument> {
  const { data, error } = await supabase
    .from('documents')
    .update({ is_estate_document: isEstateDocument })
    .eq('id', documentId)
    .select('*')
    .single();
  if (error || !data) throw new Error('Could not update document');
  return data;
}
```

### `src/components/estate/DigitalAssetTypeSelector.tsx`
**Propósito:** selector de `DigitalAssetType`, clone exacto de `src/components/coverage/AssetCategorySelector.tsx` (mesmos estilos `chip`/`chipSelected`), com `OPTIONS` para os 8 valores (`domain`→"Domain", `website`→"Website", `social_account`→"Social account", `youtube`→"YouTube", `online_business`→"Online business", `digital_ip`→"Digital IP", `crypto_account`→"Crypto account", `other`→"Other").

### `src/components/estate/FinancialAssetTypeSelector.tsx`
**Propósito:** mesmo padrão, para os 7 valores de `FinancialAssetType` (`bank`→"Bank", `investment`→"Investment", `pension`→"Pension", `insurance`→"Insurance", `crypto`→"Crypto", `property`→"Property", `other`→"Other").

### `src/components/estate/DigitalAssetForm.tsx`
**Propósito:** criar/editar um digital asset — `mode: 'create' | 'edit'`, `initialAsset?: DigitalAsset`, `userId: string`, `onSaved: (asset: DigitalAsset) => void`, `onCancelled: () => void`. Campos: `Input` para `name`, `location`, `credentials_location` (placeholder `"e.g. stored in 1Password"`), `notes`; `DigitalAssetTypeSelector`. Mesmo padrão de estado (`error`/`saving`) e botões `Cancel`/`Save` de `src/components/assets/AssetForm.tsx`.

### `src/components/estate/DigitalAssetListItem.tsx`
**Propósito:** linha da lista — nome, `type` label, `location`. `Pressable` que expande para edição inline (troca por `DigitalAssetForm mode="edit"`) e link "Delete" (`Alert.alert` de confirmação → `deleteDigitalAsset`).

### `src/components/estate/FinancialAssetForm.tsx`
**Propósito:** mesmo padrão de `DigitalAssetForm.tsx`, campos `name`, `institution`, `notes`, `FinancialAssetTypeSelector`.

### `src/components/estate/FinancialAssetListItem.tsx`
**Propósito:** mesmo padrão de `DigitalAssetListItem.tsx`, mostra `name`, `type` label, `institution`.

### `src/components/estate/TrustedPersonForm.tsx`
**Propósito:** criar/editar trusted person — `mode`, `initialPerson?: TrustedPerson`, `userId`, `onSaved`, `onCancelled`. Campos: `Input` para `name`, `relationship`, `email` (`keyboardType="email-address"`, `autoCapitalize="none"`), `phone`. Sem selector de `status` neste formulário — `status` só muda via botão dedicado "Revoke"/"Reactivate" no ecrã de detalhe.

### `src/components/estate/TrustedPersonListItem.tsx`
**Propósito:** linha da lista — `Pressable` que navega para `/estate/trusted-people/[id]` (`router.push`), mostra `name`, `relationship`, e `Badge` de `status` (`active`→tone `success`, `revoked`→tone `critical`).

### `src/components/estate/PermissionToggleList.tsx`
**Propósito:** lista das 6 `EstateSection` com toggle independente por linha (não é um `ChipRow` — todas podem estar activas ao mesmo tempo). `Props: { trustedPersonId: string; granted: EstateSection[]; onChanged: (granted: EstateSection[]) => void }`. Cada linha: label da secção (`digital_assets`→"Digital Assets", `financial_assets`→"Financial Assets", `important_documents`→"Important Documents", `assets`→"Warranty Vault", `coverage`→"Coverage", `instructions`→"Instructions") + `Badge` (`granted`→tone `success` label "Shared", ausente→tone `info` label "No access") dentro de um `Pressable` que chama `grantPermission`/`revokePermission` consoante o estado actual e actualiza `granted` via `onChanged`.

### `src/components/estate/AccessLogList.tsx`
**Propósito:** lista de `EstateAccessLogEntry[]` — cada linha mostra `section` label + `accessed_at` formatado. Estado vazio: `"No access recorded yet."`.

### `src/components/estate/EstateDocumentPicker.tsx`
**Propósito:** lista de documentos ainda não marcados (`documents.filter(d => !d.is_estate_document)`), cada linha `Pressable` com `provider`/`document_type`/`date`, ao tocar chama `setDocumentEstateFlag(doc.id, true)` e `onMarked(doc)`. Estado vazio: `"No other documents to mark."`.

### `app/(dashboard)/estate/index.tsx`
**Propósito:** hub do Digital Estate — 5 cards de navegação (Digital Assets, Financial Assets, Important Documents, Trusted People, Instructions), cada um com contagem carregada via `useFocusEffect` (`fetchDigitalAssets`, `fetchFinancialAssets`, `fetchEstateDocuments`, `fetchTrustedPeople`, `fetchEstateInstructions`) e `Pressable` que faz `router.push('/estate/<secção>')`. Cada card mostra `"{count} registered"` (ou `"Not written yet"` para Instructions, dado que é texto único, não uma contagem). Satisfaz o critério de "estado vazio com opções claras" mesmo com todas as contagens a 0, porque os cards e o CTA de cada secção são sempre visíveis.

### `app/(dashboard)/estate/digital-assets.tsx`
**Propósito:** lista + criação inline, mesmo padrão de `app/(dashboard)/assets/index.tsx` (sem rota dinâmica — edição/eliminação acontece inline na própria lista via `DigitalAssetListItem`). `useFocusEffect` → `fetchDigitalAssets(user.id)`. Estado vazio: `"No digital assets yet."` + `Button "Add digital asset"` que mostra `DigitalAssetForm mode="create"`.

### `app/(dashboard)/estate/financial-assets.tsx`
**Propósito:** mesmo padrão, com `FinancialAssetListItem`/`FinancialAssetForm`/`fetchFinancialAssets`.

### `app/(dashboard)/estate/important-documents.tsx`
**Propósito:** duas secções na mesma `ScrollView`:
- **Marked as important**: `fetchEstateDocuments(user.id)`, lista simples (`provider`/`document_type`/`date`), cada linha com link "Unmark" (`setDocumentEstateFlag(doc.id, false)` → refresh).
- **Add**: dois caminhos — `DocumentUpload` (componente já existente, sem alterações) com `onExtracted={(doc) => setDocumentEstateFlag(doc.id, true).then(refresh)}`; e, abaixo, `EstateDocumentPicker` alimentado por `fetchAllDocuments(user.id)` filtrado a `!is_estate_document`, para marcar um documento já carregado noutro fluxo (ex: uma fatura em `contracts`) como relevante para o estate sem o carregar de novo.

### `app/(dashboard)/estate/trusted-people/index.tsx`
**Propósito:** lista + criação inline, mesmo padrão de `assets/index.tsx`. `useFocusEffect` → `fetchTrustedPeople(user.id)`. Ao criar (`TrustedPersonForm mode="create"`), `router.push('/estate/trusted-people/' + person.id)` (mesmo padrão UX de `AssetsScreen.handleCreated`).

### `app/(dashboard)/estate/trusted-people/[id].tsx`
**Propósito:** vista de detalhe — primeira rota dinâmica fora de `assets/`, segue exactamente o padrão de `app/(dashboard)/assets/[id].tsx` (`useLocalSearchParams<{ id: string }>()`).
**Conteúdo:**
- `useFocusEffect` → `Promise.all([fetchTrustedPersonById(id), fetchPermissionsForTrustedPerson(id), fetchAccessLogForTrustedPerson(id)])`.
- **Profile**: campos em texto (`name`/`relationship`/`email`/`phone`) com "Edit" → `TrustedPersonForm mode="edit"`; `Badge` de `status`; botão "Revoke access" (se `active`, `updateTrustedPerson(id, { status: 'revoked' })`) ou "Reactivate" (se `revoked`).
- **Permissions**: `PermissionToggleList` alimentado pelas `section` já concedidas (`permissions.map(p => p.section)`).
- **Access log**: `AccessLogList` + botão "Log test view" por secção concedida (ou um único botão que abre um `EstateSectionSelector` simples e chama `logSimulatedAccess(id, section)` — a decisão de UI exacta fica ao critério do `/implement`, mas a chamada de dados é sempre `logSimulatedAccess`).
- Botão "Delete trusted person" no fundo, `Alert.alert` de confirmação (menciona que elimina permissões e audit log associados via cascade) → `deleteTrustedPerson(id)` → `router.back()`.

### `app/(dashboard)/estate/instructions.tsx`
**Propósito:** editor de texto livre. `useFocusEffect` → `fetchEstateInstructions(user.id)`, prefill de um `TextInput` multiline (novo, sem componente `ui/` reutilizável para multiline — usar `TextInput` directo com os mesmos estilos de `Input.tsx`, `multiline` + `numberOfLines={8}`). Botão "Save" → `upsertEstateInstructions(user.id, content)`. Nota curta acima do campo: `"Visible only to trusted people you grant access to this section."`.

---

## Fases de Implementação

### Fase 1: Schema — `supabase/schema.sql`
**Ficheiros:** modificar `supabase/schema.sql`.
**Critérios de sucesso (automáticos):**
- [ ] SQL aplica-se sem erro (`supabase db push` ou execução manual)
**Critérios de sucesso (manuais):**
- [ ] `digital_assets`, `financial_assets`, `trusted_people`, `trusted_person_permissions`, `estate_access_log`, `estate_instructions` existem com RLS activa
- [ ] `select is_estate_document from documents limit 1` devolve `false` para documentos existentes (default aplicado)

### Fase 2: Tipos — `src/types/estate.ts`, `src/types/documents.ts`
**Ficheiros:** criar/modificar os dois ficheiros.
**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa (tipos ainda não consumidos, não deve haver erro)

### Fase 3: CRUD lib + extracção — `src/lib/estate.ts`, `supabase/functions/_shared/extraction.ts`, `src/components/documents/DocumentTypeSelector.tsx`
**Ficheiros:** criar `src/lib/estate.ts`; modificar os outros dois; deploy da edge function (`supabase functions deploy extract-document`).
**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa
**Critérios de sucesso (manuais):**
- [ ] Chamar as funções de `estate.ts` a partir de uma consola/script ad-hoc confirma RLS e FKs correctos (eliminar uma trusted person elimina as suas `trusted_person_permissions`/`estate_access_log` via cascade)
- [ ] Carregar um documento de teste do tipo "will" → `extract-document` classifica correctamente (ou confirma fallback `null` sem erro se a IA não reconhecer)

### Fase 4: Componentes — `src/components/estate/`
**Ficheiros:** criar todos os ficheiros listados em "Ficheiros a Criar" dentro de `src/components/estate/`.
**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa

### Fase 5: Ecrãs + navegação — `app/(dashboard)/estate/`, `app/(dashboard)/_layout.tsx`, `app/(dashboard)/settings.tsx`
**Ficheiros:** criar todos os ecrãs de `app/(dashboard)/estate/`; modificar `_layout.tsx` e `settings.tsx`.
**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa
- [ ] `expo lint` passa sem warnings novos
**Critérios de sucesso (manuais):**
- [ ] Tab bar continua com 7 tabs visíveis (Estate não aparece)
- [ ] Settings → "Manage Digital Estate" navega para o hub
- [ ] Hub mostra as 5 secções com contagens correctas
- [ ] Criar/editar/eliminar um digital asset e um financial asset persistem e recarregam correctamente
- [ ] Marcar um documento existente como "important" e desmarcá-lo funciona; carregar um novo documento directamente como "important" também funciona
- [ ] Criar uma trusted person → abre vista de detalhe → conceder/revogar permissões reflecte-se imediatamente na lista de `PermissionToggleList`; nenhuma secção começa concedida por defeito
- [ ] "Log test view" cria uma linha em `estate_access_log`, visível na `AccessLogList`
- [ ] "Revoke access"/"Reactivate" muda o `Badge` de status na lista e no detalhe
- [ ] Escrever e gravar Instructions persiste e é recarregado ao voltar ao ecrã
- [ ] Eliminar uma trusted person pede confirmação e remove-a da lista
- [ ] Nenhum campo de password/seed phrase/private key/banking credential existe em nenhum formulário

---

## Estratégia de Testes

- **Unit:** nenhum framework de testes configurado (mesma situação do F10) — critérios automáticos limitados a `tsc --noEmit`/`expo lint`.
- **Manual:** `expo start`, testar no simulador o fluxo completo descrito na Fase 5. Confirmar zero regressão nos ecrãs existentes (Coverage, Assets/Warranty Vault, Documents, Settings com Gmail) — nenhuma alteração desta ficha toca nesses fluxos excepto a extensão aditiva de `DocumentType`/`DocumentTypeSelector`.

## Notas de Implementação

- **Determinismo/LLM:** esta ficha não introduz nenhum cálculo determinístico novo (sem insights, sem eventos de Life Calendar — ver ticket "Notas técnicas"). O único ponto que toca a Vision LLM é a extensão do prompt de extracção para reconhecer `'will'`/`'certificate'` — puramente classificação, não cálculo.
- **Sem acesso real de terceiros:** todas as RLS desta ficha são owner-only. Isto é uma limitação conhecida e documentada, não um esquecimento — ver Decisões tomadas #1 e #2, e o comentário inline no schema em `estate_access_log`.
- **`is_estate_document` é independente de `document_type`:** um documento pode ser `document_type: 'invoice'` e `is_estate_document: true` ao mesmo tempo (ex: uma factura relevante para o estate). Os dois campos nunca devem ser confundidos na UI.
- **`trusted_person_permissions`/`estate_access_log` sem soft-delete:** consistente com o resto do schema (F10 também não usa soft-delete).
- **Primeira rota dinâmica fora de `assets/`:** `estate/trusted-people/[id].tsx` — confirmar que o Expo Router regista correctamente antes de avançar para o resto da Fase 5, mesmo padrão de precaução já usado no F10 para `assets/[id].tsx`.
- **`href: null` em `Tabs.Screen`:** confirmar no simulador que a tab "Estate" não aparece e que `router.push('/estate')` ainda funciona — este é o único ponto de risco técnico não validado por precedente directo no repositório (o F10 acrescentou uma tab visível, nunca escondeu uma).

## Referências

- Research: `thoughts/shared/research/2026-09-15-digital-estate.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-digital-estate.md`
- Padrão de RLS join-ao-pai: `supabase/schema.sql:104-143` (`coverage`)
- Padrão de RLS "activo sem policies para o cliente" (considerado e não usado para `estate_access_log` — ver Decisões tomadas #2): `supabase/schema.sql:371-390` (`gmail_connections`)
- Padrão de CRUD `fetchX`/`createX`/`updateX`/`deleteX`: `src/lib/coverage.ts`
- Padrão de ecrã lista+detalhe com rota dinâmica: `app/(dashboard)/assets/index.tsx` + `app/(dashboard)/assets/[id].tsx`
- Padrão de card em Settings: `src/components/settings/GmailConnectionCard.tsx`
- Padrão de reutilização do pipeline de upload: `src/components/documents/DocumentUpload.tsx` (usado sem alterações em `important-documents.tsx`)
