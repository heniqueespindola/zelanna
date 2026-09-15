create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own row"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own row"
  on public.users for update
  using (auth.uid() = id);

-- Cria automaticamente uma linha em public.users quando alguém se regista em auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.users
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_goals text[] not null default '{}';

create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  file_url text not null,
  document_type text,             -- 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt'
  provider text,
  date date,
  amount numeric,
  extracted_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.documents
  add column if not exists expiry_date date;

alter table public.documents enable row level security;

create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

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

alter table public.assets
  add column if not exists seller text,
  add column if not exists return_deadline date;

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

alter table public.documents
  add column if not exists asset_id uuid references public.assets(id) on delete set null;

create table if not exists public.contracts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  provider text not null,
  provider_normalized text generated always as (lower(trim(provider))) stored,
  type text,                 -- 'insurance' | 'utility' | 'subscription' | 'other'
  start_date date,
  renewal_date date,
  current_amount numeric,
  created_at timestamptz not null default now()
);

alter table public.contracts enable row level security;

create policy "Users can view own contracts"
  on public.contracts for select
  using (auth.uid() = user_id);

create policy "Users can insert own contracts"
  on public.contracts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own contracts"
  on public.contracts for update
  using (auth.uid() = user_id);

create policy "Users can delete own contracts"
  on public.contracts for delete
  using (auth.uid() = user_id);

alter table public.documents
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

create table if not exists public.insights (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  type text not null,        -- 'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase' | 'coverage_gap' | 'coverage_expiring' | 'return_deadline'
  severity text not null,    -- 'info' | 'warning' | 'critical'
  data jsonb not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.insights enable row level security;

create policy "Users can view own insights"
  on public.insights for select
  using (auth.uid() = user_id);

create policy "Users can insert own insights"
  on public.insights for insert
  with check (auth.uid() = user_id);

create policy "Users can update own insights"
  on public.insights for update
  using (auth.uid() = user_id);

create policy "Users can delete own insights"
  on public.insights for delete
  using (auth.uid() = user_id);

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

alter table public.insights
  add column if not exists asset_id uuid references public.assets(id) on delete cascade;

alter table public.insights
  add column if not exists coverage_type text;   -- 'warranty' | 'insurance', só para type='coverage_gap'

alter table public.insights
  add column if not exists resolved_at timestamptz;

create unique index if not exists insights_coverage_gap_unique
  on public.insights (asset_id, type, coverage_type)
  where asset_id is not null;

create unique index if not exists insights_asset_scoped_unique
  on public.insights (asset_id, type)
  where asset_id is not null and coverage_type is null;

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

create table if not exists public.gmail_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade unique,
  google_email text not null,
  access_token text,       -- null depois de disconnect (ver gmail-disconnect/index.ts)
  refresh_token text,      -- null depois de disconnect (ver gmail-disconnect/index.ts)
  scope text not null,
  token_expires_at timestamptz not null,
  last_synced_at timestamptz,
  status text not null default 'active',   -- 'active' | 'revoked'
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS activo e SEM policies para anon/authenticated: só o service_role
-- (usado dentro das Edge Functions gmail-connect/disconnect/status/sync)
-- pode ler ou escrever tokens. O cliente nunca lê esta tabela directamente
-- (ver gmail-status/index.ts) — decisão tomada em /plan, CLAUDE.md > Segurança > least privilege.
alter table public.gmail_connections enable row level security;

create table if not exists public.gmail_import_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  gmail_message_id text not null,
  gmail_attachment_id text not null,
  document_path text,
  mime_type text,
  extracted_data jsonb,
  status text not null default 'processing',  -- 'processing' | 'pending_review' | 'imported' | 'skipped' | 'duplicate_content' | 'failed'
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint gmail_import_items_message_attachment_unique unique (user_id, gmail_message_id, gmail_attachment_id)
);

alter table public.gmail_import_items enable row level security;

create index if not exists gmail_import_items_user_status_idx
  on public.gmail_import_items (user_id, status);

-- Cliente só vê/actualiza os seus próprios itens (para reveer e marcar
-- imported/skipped); nunca insere (só gmail-sync insere, via service_role).
create policy "Users can view own gmail import items"
  on public.gmail_import_items for select
  using (auth.uid() = user_id);

create policy "Users can update own gmail import items"
  on public.gmail_import_items for update
  using (auth.uid() = user_id);
