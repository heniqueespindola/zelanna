---
data: 2026-09-15
feature: "Renewal / Price Increase Detection (F05)"
research: "thoughts/shared/research/2026-09-15-renewal-price-increase-detection.md"
status: completo
---

# Spec: Renewal / Price Increase Detection (F05)

## Visão Geral

Sempre que um documento é guardado, associá-lo automaticamente a um `contract` do mesmo fornecedor (matching determinístico por texto normalizado), comparar o novo valor com o anterior e a data de renovação usando o motor de regras já existente, gerar um `insight` (`price_increase` e/ou `renewal`) com uma frase explicativa vinda de uma nova Edge Function LLM (com fallback determinístico), e mostrar os insights e próximas renovações no Dashboard.

## Decisões tomadas (substituem as questões em aberto do research)

- **`contracts` como tabela própria**, ligada a `documents` via `documents.contract_id` (nullable FK, paralelo a `asset_id`). RLS por `user_id` directo (padrão 1, igual a `documents`/`assets`).
- **Matching de fornecedor:** normalização simples — `trim().toLowerCase()` — comparada via uma coluna gerada `provider_normalized` em `contracts`. Sem confirmação manual do utilizador nesta ficha (fora do escopo: fuzzy matching/confirmação manual, conforme o ticket). Falsos negativos entre nomes muito diferentes do mesmo fornecedor (ex: "Fidelidade" vs "Fidelidade Companhia de Seguros") são uma limitação conhecida e documentada, não um bug.
- **Documentos elegíveis para contrato:** apenas `document_type` recorrente — `'insurance' | 'invoice' | 'contract'`. `'warranty'` e `'receipt'` nunca criam/actualizam um `contract` (são eventos pontuais, não recorrentes).
- **Threshold de renovação:** parametrizável via argumento de função (reutilizando `isExpiringSoon(dateISO, thresholdDays)` já existente), com default de 30 dias — consistente com o F04. Não fixo a 17 dias (esse era só o exemplo do ticket).
- **Periodicidade (`billing_period`):** fora do escopo desta ficha. Assume-se que duas faturas do mesmo fornecedor são comparáveis directamente. Documentar como limitação conhecida (ver Notas de Implementação).
- **`events` (Life Calendar):** não criado nesta ficha. O alerta de renovação é calculado em runtime a partir de `contracts.renewal_date` sempre que o Dashboard carrega — sem notificação proactiva (F08).
- **Dashboard:** os cards "Upcoming renewals" e "Recent insights" em `app/(dashboard)/index.tsx` são populados nesta ficha com dados reais (decisão confirmada com o utilizador — evita implementar a mesma leitura de dados duas vezes em F08).

## Ficheiros a Criar

### `src/types/contracts.ts`
**Propósito:** Tipos TypeScript para `contracts`, espelhando `src/types/assets.ts`.
**Conteúdo:**
```typescript
export type ContractType = 'insurance' | 'utility' | 'subscription' | 'other';

export interface Contract {
  id: string;
  user_id: string;
  provider: string;
  type: ContractType | null;
  start_date: string | null;
  renewal_date: string | null;
  current_amount: number | null;
  created_at: string;
}
```

### `src/types/insights.ts`
**Propósito:** Tipos TypeScript para `insights`, incluindo os payloads `data` estruturados por tipo.
**Conteúdo:**
```typescript
import type { InsightSeverity } from '@/lib/rulesEngine';

export type InsightType = 'price_increase' | 'renewal';

export interface PriceIncreaseInsightData {
  provider: string;
  previousAmount: number;
  currentAmount: number;
  changeAmount: number;
  changePercent: number;
}

export interface RenewalInsightData {
  provider: string;
  renewalDate: string;
  daysUntilRenewal: number;
}

export interface Insight {
  id: string;
  user_id: string;
  contract_id: string | null;
  type: InsightType;
  severity: InsightSeverity;
  data: PriceIncreaseInsightData | RenewalInsightData;
  message: string;
  created_at: string;
}
```
**Nota:** `InsightSeverity` já existe em `src/lib/rulesEngine.ts` (`'info' | 'warning' | 'critical'`) — reexportar via import, não duplicar o tipo.

### `src/lib/contracts.ts`
**Propósito:** Camada de acesso a dados para `contracts`, incluindo o matching por fornecedor normalizado. Segue exactamente o padrão de `src/lib/coverage.ts` (colunas explícitas numa constante, `throw new Error(...)` curto, sem try/catch aninhado).
**Conteúdo:**
```typescript
import { supabase } from '@/lib/supabase';
import type { DocumentType } from '@/types/documents';
import type { Contract, ContractType } from '@/types/contracts';

const CONTRACT_COLUMNS =
  'id, user_id, provider, type, start_date, renewal_date, current_amount, created_at';

export function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

export function mapDocumentTypeToContractType(docType: DocumentType | null): ContractType | null {
  if (docType === 'insurance') return 'insurance';
  if (docType === 'invoice') return 'utility';
  if (docType === 'contract') return 'subscription';
  return null;
}

export async function fetchContracts(userId: string): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load contracts');
  return data ?? [];
}

async function findContractByProvider(userId: string, providerNormalized: string): Promise<Contract | null> {
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('user_id', userId)
    .eq('provider_normalized', providerNormalized)
    .maybeSingle();
  if (error) throw new Error('Could not look up contract');
  return data;
}

export interface ContractMatchResult {
  contract: Contract;
  previousAmount: number | null;
}

export async function matchDocumentToContract(params: {
  userId: string;
  documentId: string;
  documentType: DocumentType | null;
  provider: string | null;
  amount: number | null;
  date: string | null;
  expiryDate: string | null;
}): Promise<ContractMatchResult | null> {
  const contractType = mapDocumentTypeToContractType(params.documentType);
  if (!contractType || !params.provider) return null;

  const providerNormalized = normalizeProvider(params.provider);
  const existing = await findContractByProvider(params.userId, providerNormalized);

  if (!existing) {
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        user_id: params.userId,
        provider: params.provider,
        type: contractType,
        start_date: params.date,
        renewal_date: params.expiryDate,
        current_amount: params.amount,
      })
      .select(CONTRACT_COLUMNS)
      .single();
    if (error || !data) throw new Error('Could not create contract');
    await supabase.from('documents').update({ contract_id: data.id }).eq('id', params.documentId);
    return { contract: data, previousAmount: null };
  }

  const previousAmount = existing.current_amount;
  const { data, error } = await supabase
    .from('contracts')
    .update({
      renewal_date: params.expiryDate ?? existing.renewal_date,
      current_amount: params.amount ?? existing.current_amount,
    })
    .eq('id', existing.id)
    .select(CONTRACT_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not update contract');
  await supabase.from('documents').update({ contract_id: data.id }).eq('id', params.documentId);
  return { contract: data, previousAmount };
}
```
**Nota:** `matchDocumentToContract` devolve `null` (sem lançar erro) quando o `document_type` não é elegível (`warranty`/`receipt`) ou não há `provider` — isto **não** é uma falha, é o caso "documento não recorrente", pelo que o chamador não deve tratar `null` como erro.

### `src/lib/insights.ts`
**Propósito:** Orquestra a geração de insights a partir de um `ContractMatchResult` — calcula (via `rulesEngine.ts`), pede explicação ao LLM (com fallback determinístico) e persiste. Também expõe leituras para o Dashboard.
**Conteúdo:**
```typescript
import { supabase } from '@/lib/supabase';
import {
  daysUntil,
  isExpiringSoon,
  isSignificantIncrease,
  percentageChange,
  type InsightSeverity,
} from '@/lib/rulesEngine';
import type { Contract } from '@/types/contracts';
import type { Insight, InsightType, PriceIncreaseInsightData, RenewalInsightData } from '@/types/insights';

const INSIGHT_COLUMNS = 'id, user_id, contract_id, type, severity, data, message, created_at';
const RENEWAL_THRESHOLD_DAYS = 30;
const PRICE_INCREASE_THRESHOLD_PERCENT = 10;

function fallbackMessage(type: InsightType, data: PriceIncreaseInsightData | RenewalInsightData): string {
  if (type === 'price_increase') {
    const d = data as PriceIncreaseInsightData;
    return `${d.provider}: price went from €${d.previousAmount} to €${d.currentAmount} (+${d.changePercent.toFixed(1)}%).`;
  }
  const d = data as RenewalInsightData;
  return `${d.provider} renews in ${d.daysUntilRenewal} days (${d.renewalDate}).`;
}

async function explainInsight(
  type: InsightType,
  data: PriceIncreaseInsightData | RenewalInsightData
): Promise<string> {
  const { data: result, error } = await supabase.functions.invoke<{ message: string }>(
    'explain-insight',
    { body: { type, ...data } }
  );
  if (error || !result?.message) throw new Error('Explanation failed');
  return result.message;
}

async function saveInsight(params: {
  userId: string;
  contractId: string;
  type: InsightType;
  severity: InsightSeverity;
  data: PriceIncreaseInsightData | RenewalInsightData;
}): Promise<Insight> {
  let message: string;
  try {
    message = await explainInsight(params.type, params.data);
  } catch {
    message = fallbackMessage(params.type, params.data);
  }

  const { data, error } = await supabase
    .from('insights')
    .insert({
      user_id: params.userId,
      contract_id: params.contractId,
      type: params.type,
      severity: params.severity,
      data: params.data,
      message,
    })
    .select(INSIGHT_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save insight');
  return data;
}

export async function generateInsightsForContract(params: {
  userId: string;
  contract: Contract;
  previousAmount: number | null;
}): Promise<Insight[]> {
  const { userId, contract, previousAmount } = params;
  const created: Insight[] = [];

  if (previousAmount !== null && contract.current_amount !== null) {
    const changePercent = percentageChange(contract.current_amount, previousAmount);
    if (isSignificantIncrease(contract.current_amount, previousAmount, PRICE_INCREASE_THRESHOLD_PERCENT)) {
      const data: PriceIncreaseInsightData = {
        provider: contract.provider,
        previousAmount,
        currentAmount: contract.current_amount,
        changeAmount: contract.current_amount - previousAmount,
        changePercent,
      };
      created.push(
        await saveInsight({ userId, contractId: contract.id, type: 'price_increase', severity: 'warning', data })
      );
    }
  }

  if (contract.renewal_date && isExpiringSoon(contract.renewal_date, RENEWAL_THRESHOLD_DAYS)) {
    const days = daysUntil(contract.renewal_date);
    const data: RenewalInsightData = {
      provider: contract.provider,
      renewalDate: contract.renewal_date,
      daysUntilRenewal: days,
    };
    created.push(
      await saveInsight({
        userId,
        contractId: contract.id,
        type: 'renewal',
        severity: days <= 7 ? 'critical' : 'warning',
        data,
      })
    );
  }

  return created;
}

export async function fetchRecentInsights(userId: string, limit: number = 5): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('insights')
    .select(INSIGHT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Could not load insights');
  return data ?? [];
}

export async function fetchUpcomingRenewals(userId: string): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id, user_id, provider, type, start_date, renewal_date, current_amount, created_at')
    .eq('user_id', userId)
    .not('renewal_date', 'is', null)
    .order('renewal_date', { ascending: true });
  if (error) throw new Error('Could not load renewals');
  return (data ?? []).filter((c) => c.renewal_date && isExpiringSoon(c.renewal_date, RENEWAL_THRESHOLD_DAYS));
}
```
**Nota crítica:** `generateInsightsForContract` é a única função que chama o LLM (via `explainInsight`, dentro de `saveInsight`) — e mesmo aí, o `try/catch` garante que uma falha na chamada nunca impede o `insert` em `insights` (usa `fallbackMessage` em vez de bloquear). Isto satisfaz a regra #6 do `CLAUDE.md` (motor sempre determinístico) e o critério de aceitação sobre fallback.

### `supabase/functions/explain-insight/index.ts`
**Propósito:** Nova Edge Function que recebe apenas números já calculados e devolve uma frase em linguagem natural. Mais simples que `extract-document` (sem `service_role`, sem Storage).
**Conteúdo:**
```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

interface PriceIncreaseBody {
  type: 'price_increase';
  provider: string;
  previousAmount: number;
  currentAmount: number;
  changeAmount: number;
  changePercent: number;
}

interface RenewalBody {
  type: 'renewal';
  provider: string;
  renewalDate: string;
  daysUntilRenewal: number;
}

type RequestBody = PriceIncreaseBody | RenewalBody;

const EXPLAIN_SYSTEM_PROMPT = `You are writing a short, factual, calm notification for a personal life administration app.
You will receive numbers that were already calculated by a deterministic rules engine — never recalculate or invent any number.
Respond with ONLY one short sentence in English, no JSON, no markdown, no prose before or after.
For "price_increase": state the provider and the percentage increase, using the exact numbers given.
For "renewal": state the provider and how many days until renewal, using the exact numbers given.
Tone: clear, calm, trustworthy, never alarmist — but direct and actionable.`;

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const body: RequestBody = await req.json();

  const supabaseAuthed = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
  } = await supabaseAuthed.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 256,
      system: EXPLAIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(body) }],
    }),
  });

  if (!anthropicResponse.ok) {
    return new Response(JSON.stringify({ error: 'Explanation unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicResult = await anthropicResponse.json();
  const message: string | undefined = anthropicResult?.content?.[0]?.text?.trim();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Explanation unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### `src/components/dashboard/RenewalTimeline.tsx`
**Propósito:** Lista de próximas renovações no Dashboard (nome sugerido no `CLAUDE.md` → estrutura de pastas).
**Conteúdo:**
```typescript
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { daysUntil } from '@/lib/rulesEngine';
import type { Contract } from '@/types/contracts';

interface Props {
  contracts: Contract[];
}

export function RenewalTimeline({ contracts }: Props) {
  if (contracts.length === 0) {
    return <Text style={styles.empty}>No renewals tracked yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {contracts.map((contract) => (
        <Text key={contract.id} style={styles.row}>
          {contract.provider} — renews in {daysUntil(contract.renewal_date!)} days
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.body, color: colors.border },
  list: { gap: spacing.xs },
  row: { fontFamily: fonts.body, color: colors.border },
});
```

### `src/components/dashboard/InsightCard.tsx`
**Propósito:** Uma linha de insight (mensagem + badge de severidade) no Dashboard.
**Conteúdo:**
```typescript
import { View, Text, StyleSheet } from 'react-native';
import { fonts, spacing } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { Insight } from '@/types/insights';

interface Props {
  insight: Insight;
}

export function InsightCard({ insight }: Props) {
  return (
    <View style={styles.row}>
      <Badge label={insight.type === 'price_increase' ? 'Price increase' : 'Renewal'} tone={insight.severity} />
      <Text style={styles.message}>{insight.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  message: { fontFamily: fonts.body, color: '#FFFFFF' },
});
```
**Nota:** `insight.severity` (`'info' | 'warning' | 'critical'`) é passado directamente como `tone` do `Badge` — os literais coincidem, não precisa de função de mapeamento.

## Ficheiros a Modificar

### `supabase/schema.sql`
**Modificações (acrescentar ao fim do ficheiro, seguindo o padrão incremental já usado para `asset_id`):**
- [ ] Criar tabela `contracts`:
```sql
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
```
- [ ] Adicionar `contract_id` a `documents` (paralelo a `asset_id`):
```sql
alter table public.documents
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;
```
- [ ] Criar tabela `insights`:
```sql
create table if not exists public.insights (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  type text not null,        -- 'price_increase' | 'renewal'
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
```

### `src/types/documents.ts`
**Modificações:**
- [ ] `UploadedDocument`: adicionar `contract_id: string | null;` (paralelo a `asset_id`, logo a seguir a essa linha).

### `src/lib/rulesEngine.ts`
**Modificações:** nenhuma alteração às funções existentes — `percentageChange`, `isSignificantIncrease`, `isExpiringSoon`, `daysUntil` são reutilizadas tal como estão a partir de `src/lib/insights.ts`. Não adicionar `evaluateRenewal`/`evaluatePriceChange` como wrappers — seriam duplicação sem ganho, já que a computação cabe directamente em `generateInsightsForContract` (ver ficheiro acima).

### `src/components/documents/DocumentPreviewForm.tsx`
**Modificações:**
- [ ] Import: adicionar `import { matchDocumentToContract } from '@/lib/contracts';` e `import { generateInsightsForContract } from '@/lib/insights';`
- [ ] Em `handleConfirm`, imediatamente a seguir a `const doc = await saveDocument({...})` e antes de `onSaved(doc)`, adicionar bloco best-effort que nunca bloqueia o `onSaved`:
```typescript
try {
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
    await generateInsightsForContract({ userId, contract: match.contract, previousAmount: match.previousAmount });
  }
} catch {
  // matching/insight é best-effort — o documento já foi guardado com sucesso
}
```
- [ ] `onSaved(doc)` mantém-se depois deste bloco (o `try/catch` garante que uma falha aqui nunca impede o fluxo normal de "documento guardado").

**Critério de aceitação relevante:** "Nenhum insight de `price_increase` é gerado com menos de dois pontos de dados" — garantido porque `matchDocumentToContract` só devolve `previousAmount !== null` quando já existia um `contract` anterior; `generateInsightsForContract` só calcula `price_increase` quando `previousAmount !== null`.

### `app/(dashboard)/index.tsx`
**Modificações:** reescrever para ecrã com estado, seguindo o padrão de `coverage.tsx` (fetch em `useEffect`, sem hook dedicado).
```typescript
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchUpcomingRenewals, fetchRecentInsights } from '@/lib/insights';
import { RenewalTimeline } from '@/components/dashboard/RenewalTimeline';
import { InsightCard } from '@/components/dashboard/InsightCard';
import type { Contract } from '@/types/contracts';
import type { Insight } from '@/types/insights';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [renewals, setRenewals] = useState<Contract[] | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchUpcomingRenewals(user.id), fetchRecentInsights(user.id)]).then(
      ([loadedRenewals, loadedInsights]) => {
        setRenewals(loadedRenewals);
        setInsights(loadedInsights);
      }
    );
  }, [user]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>What&apos;s happening with your life admin.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upcoming renewals</Text>
        {renewals === null ? (
          <Text style={styles.cardBody}>Loading…</Text>
        ) : (
          <RenewalTimeline contracts={renewals} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent insights</Text>
        {insights === null ? (
          <Text style={styles.cardBody}>Loading…</Text>
        ) : insights.length === 0 ? (
          <Text style={styles.cardBody}>Upload a document to get your first insight.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.body, fontWeight: '600', color: colors.white, marginBottom: spacing.xs },
  cardBody: { fontFamily: fonts.body, color: colors.border },
});
```
- [ ] Remover o comentário `{/* TODO: F08 — Alerts e Life Calendar básico (eventos + insights recentes) */}` (dados reais já ligados nesta ficha; F08 fica responsável por notificações proactivas/push, não pela leitura destes dois cards).

## Fases de Implementação

### Fase 1: Schema — tabelas `contracts` e `insights`
**Ficheiros:**
- Modificar `supabase/schema.sql` (tabela `contracts`, coluna `documents.contract_id`, tabela `insights`)

**Critérios de sucesso (automáticos):**
- [x] SQL aplica sem erros num projecto Supabase limpo (`supabase db reset` ou execução manual no SQL editor)

**Critérios de sucesso (manuais):**
- [x] Inserir uma linha de teste em `contracts` autenticado como utilizador A; confirmar que utilizador B não a vê (RLS)
- [x] Confirmar que `provider_normalized` é calculado automaticamente (`insert into contracts (user_id, provider) values (...)` e depois `select provider_normalized from contracts` devolve o texto em minúsculas, sem espaços)

### Fase 2: Camada de dados e motor — `contracts.ts`, `insights.ts`, tipos
**Ficheiros:**
- Criar `src/types/contracts.ts`, `src/types/insights.ts`
- Modificar `src/types/documents.ts` (`contract_id`)
- Criar `src/lib/contracts.ts`, `src/lib/insights.ts` (sem a Edge Function ainda — `explainInsight` vai falhar e cair no fallback, o que é aceitável e testável nesta fase)

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` sem erros

**Critérios de sucesso (manuais):**
- [x] Chamar `matchDocumentToContract` duas vezes seguidas com o mesmo `provider` (via um script ad-hoc ou pela UI na Fase 4) e confirmar que a segunda chamada devolve `previousAmount` não nulo e reutiliza o mesmo `contract.id`

### Fase 3: Edge Function `explain-insight`
**Ficheiros:**
- Criar `supabase/functions/explain-insight/index.ts`

**Critérios de sucesso (automáticos):**
- [x] `supabase functions deploy explain-insight` sem erros (ou `supabase functions serve` localmente)

**Critérios de sucesso (manuais):**
- [x] Invocar a function autenticado com um payload `price_increase` de exemplo e confirmar que devolve `{ message: string }` com uma frase curta em inglês, sem JSON/markdown
- [x] Invocar sem `Authorization` header e confirmar resposta 401
- [x] Confirmar que a chamada a partir de `src/lib/insights.ts` (`explainInsight`) já não cai no fallback quando a function está deployed

### Fase 4: UI — ligação automática ao guardar documento + Dashboard
**Ficheiros:**
- Modificar `src/components/documents/DocumentPreviewForm.tsx`
- Criar `src/components/dashboard/RenewalTimeline.tsx`, `src/components/dashboard/InsightCard.tsx`
- Modificar `app/(dashboard)/index.tsx`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` sem erros
- [x] `expo lint` sem warnings

**Critérios de sucesso (manuais):**
- [x] Carregar um primeiro documento de seguro (ex: provider "Fidelidade", amount 300, expiry_date daqui a 20 dias) — nenhum insight aparece no Dashboard ainda (só 1 ponto de dados), mas "Upcoming renewals" já mostra "Fidelidade — renews in 20 days"
- [x] Carregar um segundo documento com o mesmo provider "fidelidade" (case diferente) e amount 345 (+15%) — confirmar que é associado ao mesmo `contract` (não cria um segundo) e que aparecem dois insights no Dashboard: `price_increase` (+15%) e `renewal`
- [x] Carregar um documento `document_type: 'warranty'` — confirmar que **não** cria nenhum `contract` nem insight
- [x] Desligar a Edge Function (ou simular falha, ex: `ANTHROPIC_API_KEY` inválida) e confirmar que o insight é guardado na mesma, com a mensagem de fallback determinística (`fallbackMessage`)

## Estratégia de Testes

- **Unit:** não há test runner configurado no projecto (confirmado no research — sem jest/vitest). Não introduzir um framework de testes nesta ficha (fora do escopo pedido); a validação é manual, conforme os critérios de sucesso de cada fase. Se o utilizador quiser cobertura automática de `rulesEngine.ts`/`insights.ts` no futuro, isso é uma ficha à parte.
- **Manual:** ver critérios de sucesso manuais por fase acima — cobre o caminho feliz (dois documentos do mesmo fornecedor), o caso sem histórico (zero insights), o caso não elegível (`warranty`), e o caso de falha do LLM (fallback).

## Notas de Implementação

- **Separação cálculo/explicação (regra #6 do `CLAUDE.md`):** `generateInsightsForContract` (`src/lib/insights.ts`) calcula tudo com `percentageChange`/`isSignificantIncrease`/`isExpiringSoon`/`daysUntil` de `rulesEngine.ts` **antes** de chamar `explainInsight`; a Edge Function `explain-insight` só recebe os números já calculados e nunca datas/amounts brutos por processar. O prompt do sistema instrui explicitamente "never recalculate or invent any number".
- **Fallback determinístico:** `fallbackMessage` em `src/lib/insights.ts` garante que o `insert` em `insights` nunca depende da disponibilidade do LLM — chamado no `catch` de `explainInsight`.
- **Matching best-effort, não bloqueante:** o bloco adicionado a `DocumentPreviewForm.handleConfirm` está fora do `try/catch` que já existia à volta de `saveDocument` — tem o seu próprio `try/catch` interno, para que uma falha em `matchDocumentToContract`/`generateInsightsForContract` nunca transforme um "documento guardado com sucesso" num erro visível ao utilizador.
- **`provider_normalized` como coluna gerada (stored):** evita repetir `lower(trim(...))` em cada query no cliente e mantém a normalização no schema (mais próximo da fonte da verdade). O matching em `src/lib/contracts.ts` usa sempre `provider_normalized`, nunca `provider` directamente em queries de igualdade.
- **Limitação conhecida — variantes de nome do mesmo fornecedor:** documentado no research e nesta spec; fora do escopo resolver com fuzzy matching ou confirmação manual (ver "Fora do escopo" no ticket original).
- **Limitação conhecida — periodicidade:** a comparação `previousAmount` vs `currentAmount` assume que ambos os documentos têm a mesma periodicidade de facturação. Sem o campo `billing_period` (que só existe na tabela `bills`, fora do escopo de F05), não há validação disto — uma mudança de mensal para anual no mesmo fornecedor geraria um `price_increase` incorrecto. Aceitável para o MVP/validação manual; revisitar em F06/F07 (Bills Intelligence).
- **`contracts.type` vs `documents.document_type`:** `mapDocumentTypeToContractType` é uma heurística simples (`insurance→insurance`, `invoice→utility`, `contract→subscription`) — não crítica para o cálculo (que usa só `amount`/`renewal_date`), serve apenas para categorização futura.
- **Fixes encontrados durante a validação manual (fora do escopo original da spec, mas necessários para o caminho feliz funcionar):**
  - `src/lib/extraction.ts`: `uploadDocument` lia ficheiros via `fetch(uri)`, que falha em URIs `content://` do Android (caso do `expo-document-picker` para PDF) — trocado por `new File(uri).arrayBuffer()` (`expo-file-system`).
  - `supabase/functions/extract-document/index.ts`: não verificava `anthropicResponse.ok` antes de fazer `JSON.parse`, e não tratava respostas do Claude envolvidas em markdown fences (```json ... ```) — ambos corrigidos.
  - `app/(dashboard)/index.tsx` e `app/(dashboard)/coverage.tsx`: usavam `useEffect([user])`, que só corre no mount — como os tabs do Expo Router mantêm ecrãs montados, dados criados noutra tab só apareciam depois de um reload completo. Trocado por `useFocusEffect`.
  - `src/components/documents/DocumentUpload.tsx`: não havia forma de voltar a `'idle'` depois de gravar um documento — adicionado botão "Upload another document".
  - `src/components/coverage/CoverageCheckForm.tsx`: a lista "Create an asset from one of your documents" só aparecia quando `assets.length === 0`, impedindo criar mais do que um asset a partir de documentos.

## Referências

- Research: `thoughts/shared/research/2026-09-15-renewal-price-increase-detection.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-renewal-price-increase-detection.md`
- Padrão de camada de dados: `src/lib/coverage.ts`
- Padrão de Edge Function: `supabase/functions/extract-document/index.ts`
- Padrão de ecrã com fetch em `useEffect`: `app/(dashboard)/coverage.tsx`
- Motor de cálculo reutilizado: `src/lib/rulesEngine.ts:63-79` (`percentageChange`, `isSignificantIncrease`, `isAnomaly`, `average`), `src/lib/rulesEngine.ts:1-14` (`daysUntil`, `isExpiringSoon`)
