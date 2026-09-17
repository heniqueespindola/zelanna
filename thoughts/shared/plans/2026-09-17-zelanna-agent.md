---
data: 2026-09-17
feature: "Zelanna Agent (F14)"
research: "thoughts/shared/research/2026-09-17-zelanna-agent.md"
status: completo
---

# Spec: Zelanna Agent (F14)

## Visão Geral

Implementa o fluxo **detectar renovação → pesquisar alternativas → preparar rascunho → aprovar → confirmar envio manual → audit log**, para contratos (`contracts`) com `renewal_date` nos próximos 60 dias. Nunca executa nada automaticamente: a única "execução" desta fase é o utilizador confirmar que enviou manualmente uma comunicação cujo rascunho foi gerado e por ele aprovado.

**Decisões confirmadas com o utilizador (fecham as questões em aberto do research):**
1. Fonte de "alternativas mais baratas": **LLM com `web_search` tool** da Anthropic Messages API — sempre apresentado como sugestão não verificada.
2. Canal de execução: **rascunho para envio manual** — sem novo scope OAuth Gmail, sem envio automático.
3. Audit log: **nova tabela `agent_actions`** com ciclo `proposed → approved → executed` (+ `rejected`), seguindo o padrão de RLS owner-side já usado em `contracts`/`insights`.

## Ficheiros a Criar

### `supabase/schema.sql` (acrescentar ao fim do ficheiro, seguindo o padrão de migração aditiva já usado)

```sql
create table if not exists public.agent_actions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  action_type text not null,        -- 'cancel' | 'renegotiate'
  status text not null default 'proposed',  -- 'proposed' | 'approved' | 'executed' | 'rejected' | 'failed'
  alternatives jsonb,                -- sugestões do LLM (web_search) — null até serem pedidas
  draft_content text,                -- rascunho gerado pelo LLM — null até ser gerado
  approved_at timestamptz,
  executed_at timestamptz,
  result text,
  created_at timestamptz not null default now()
);

alter table public.agent_actions enable row level security;

create policy "Users can view own agent actions"
  on public.agent_actions for select
  using (auth.uid() = user_id);

create policy "Users can insert own agent actions"
  on public.agent_actions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own agent actions"
  on public.agent_actions for update
  using (auth.uid() = user_id);

-- Sem policy de delete: um agent_action é histórico/audit, nunca apagado pelo utilizador.
-- Sem índice único: um contrato pode ter múltiplas propostas ao longo do tempo
-- (ex: proposta rejeitada e depois retomada), ao contrário de insights (que são idempotentes).
```

**Nota:** `status = 'failed'` não é alcançável nesta fase (não há execução automática que possa falhar) — mantido no schema apenas para não obrigar a uma migração futura quando uma fase posterior introduzir execução real (ex: envio via Gmail API). Documentar isto no código, não implementar UI/lib para esse estado.

### `src/types/agent.ts`

```typescript
export type AgentActionType = 'cancel' | 'renegotiate';
export type AgentActionStatus = 'proposed' | 'approved' | 'executed' | 'rejected' | 'failed';

export interface AgentActionAlternative {
  providerName: string;
  note: string;
}

export interface AgentAction {
  id: string;
  user_id: string;
  contract_id: string;
  action_type: AgentActionType;
  status: AgentActionStatus;
  alternatives: AgentActionAlternative[] | null;
  draft_content: string | null;
  approved_at: string | null;
  executed_at: string | null;
  result: string | null;
  created_at: string;
}
```

### `supabase/functions/agent-find-alternatives/index.ts`

**Propósito:** dado um contrato, pedir ao LLM (com `web_search` tool) sugestões de fornecedores alternativos. Segue exactamente o padrão de auth de `supabase/functions/explain-insight/index.ts:118-137` (`supabaseAuthed.auth.getUser()`, 401 se `!user`).

**Contrato:**
- Request body: `{ provider: string; type: 'insurance' | 'utility' | 'subscription' | 'other'; currentAmount: number | null }`
- Response 200: `{ alternatives: { providerName: string; note: string }[] }`
- Response 502: `{ error: string }` se a chamada Anthropic falhar ou a resposta não vier em JSON válido

**System prompt (constante `AGENT_ALTERNATIVES_SYSTEM_PROMPT`):**
```
You are researching alternative providers for a personal life administration app.
You have access to web search. Find up to 5 well-known providers in Portugal that
offer a comparable {type} product to the one described, as potential cheaper
alternatives to {provider}.
Never state a specific price as fact — you cannot verify current pricing. Each
"note" must be phrased as an unverified suggestion (e.g. "often cited as competitive
on price", never "costs €X").
Respond with ONLY a JSON object: {"alternatives": [{"providerName": "...", "note": "..."}]}.
No markdown, no prose outside the JSON.
```

**Implementação:**
- Mesmo padrão de criação de clientes Supabase de `explain-insight/index.ts:122-137`
- Chamada a `https://api.anthropic.com/v1/messages` com `model: 'claude-sonnet-5'`, `max_tokens: 1024`, `system: AGENT_ALTERNATIVES_SYSTEM_PROMPT`, `messages: [{ role: 'user', content: JSON.stringify(body) }]`, e um `tools: [{ type: 'web_search_20250305', name: 'web_search' }]` (ou o identificador de tool/beta header que a documentação Anthropic corrente definir para `web_search` — **confirmar o valor exacto e o header `anthropic-beta` necessário na documentação Anthropic actual antes de implementar**, dado que nenhuma chamada existente no codebase usa tools)
- Fazer `JSON.parse` do texto final da resposta; se o parse falhar, devolver 502 `{ error: 'Alternatives unavailable.' }` (nunca inventar alternativas no código do lado do servidor)

### `supabase/functions/agent-draft-action/index.ts`

**Propósito:** dado um contrato e uma acção (`cancel` | `renegotiate`), gerar um rascunho de comunicação em linguagem natural. Mesmo padrão de auth.

**Contrato:**
- Request body: `{ provider: string; actionType: 'cancel' | 'renegotiate'; renewalDate: string; currentAmount: number | null }`
- Response 200: `{ draft: string }`
- Response 502: `{ error: string }`

**System prompt (constante `AGENT_DRAFT_SYSTEM_PROMPT`):**
```
You are drafting a short, polite, factual message for a user to send to a provider,
about their own contract. You will receive the provider name, the action requested
("cancel" or "renegotiate"), the renewal date and the current amount — never invent
any fact not given to you.
For "cancel": draft a cancellation request effective at or before the renewal date.
For "renegotiate": draft a message asking the provider to review the price given the
renewal date, without proposing a target price.
This is a DRAFT for the user to review and edit before sending themselves — never
address it as if already sent, never sign it with any name.
Respond with ONLY the message text in English. No JSON, no markdown, no subject line.
```

**Implementação:** idêntica a `explain-insight/index.ts` (sem tools), `max_tokens: 512`.

### `src/lib/agent.ts`

```typescript
import { supabase } from '@/lib/supabase';
import { fetchLifeCalendarEvents, type LifeCalendarEntry } from '@/lib/events';
import type { AgentAction, AgentActionAlternative, AgentActionType } from '@/types/agent';
import type { Contract } from '@/types/contracts';

const AGENT_ACTION_COLUMNS =
  'id, user_id, contract_id, action_type, status, alternatives, draft_content, approved_at, executed_at, result, created_at';

export async function fetchRenewalCandidates(userId: string): Promise<LifeCalendarEntry[]> {
  const entries = await fetchLifeCalendarEvents(userId);
  return entries.filter((e) => e.source === 'contract');
}

export async function fetchAgentActionsForContract(contractId: string): Promise<AgentAction[]> {
  const { data, error } = await supabase
    .from('agent_actions')
    .select(AGENT_ACTION_COLUMNS)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load agent actions');
  return data ?? [];
}

export async function proposeAgentAction(params: {
  userId: string;
  contractId: string;
  actionType: AgentActionType;
}): Promise<AgentAction> {
  const { data, error } = await supabase
    .from('agent_actions')
    .insert({ user_id: params.userId, contract_id: params.contractId, action_type: params.actionType })
    .select(AGENT_ACTION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not propose action');
  return data;
}

export async function findAlternativesForAction(
  actionId: string,
  contract: Contract
): Promise<AgentAction> {
  const { data: result, error: invokeError } = await supabase.functions.invoke<{
    alternatives: AgentActionAlternative[];
  }>('agent-find-alternatives', {
    body: { provider: contract.provider, type: contract.type, currentAmount: contract.current_amount },
  });
  if (invokeError || !result) throw new Error('Could not find alternatives');
  const { data, error } = await supabase
    .from('agent_actions')
    .update({ alternatives: result.alternatives })
    .eq('id', actionId)
    .select(AGENT_ACTION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save alternatives');
  return data;
}

export async function draftAction(actionId: string, contract: Contract, actionType: AgentActionType): Promise<AgentAction> {
  const { data: result, error: invokeError } = await supabase.functions.invoke<{ draft: string }>(
    'agent-draft-action',
    {
      body: {
        provider: contract.provider,
        actionType,
        renewalDate: contract.renewal_date,
        currentAmount: contract.current_amount,
      },
    }
  );
  if (invokeError || !result?.draft) throw new Error('Could not draft action');
  const { data, error } = await supabase
    .from('agent_actions')
    .update({ draft_content: result.draft })
    .eq('id', actionId)
    .select(AGENT_ACTION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save draft');
  return data;
}

export async function approveAgentAction(actionId: string): Promise<AgentAction> {
  const { data, error } = await supabase
    .from('agent_actions')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('status', 'proposed')
    .select(AGENT_ACTION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not approve action');
  return data;
}

export async function rejectAgentAction(actionId: string): Promise<AgentAction> {
  const { data, error } = await supabase
    .from('agent_actions')
    .update({ status: 'rejected' })
    .eq('id', actionId)
    .in('status', ['proposed', 'approved'])
    .select(AGENT_ACTION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not reject action');
  return data;
}

export async function markAgentActionExecuted(actionId: string, result: string): Promise<AgentAction> {
  const { data, error } = await supabase
    .from('agent_actions')
    .update({ status: 'executed', executed_at: new Date().toISOString(), result })
    .eq('id', actionId)
    .eq('status', 'approved')
    .select(AGENT_ACTION_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not mark action as executed');
  return data;
}
```

**Nota sobre imutabilidade de `approved_at`:** cada função de transição (`approveAgentAction`, `rejectAgentAction`, `markAgentActionExecuted`) filtra por `.eq('status', ...)` / `.in('status', ...)` no estado de origem esperado — se a linha já mudou de estado (ex: já `executed`), o `update` não afecta nenhuma linha e `data` vem `null`, o que a função trata como erro. Isto impede reescrever `approved_at` depois de definido, sem precisar de trigger de base de dados nesta fase.

### `app/(dashboard)/agent/_layout.tsx`

Igual a `app/(dashboard)/estate/_layout.tsx:1-13` (Stack, `headerShown: false`, `contentStyle: { backgroundColor: colors.bgDarkest }`).

### `app/(dashboard)/agent/index.tsx`

**Propósito:** lista de contratos a renovar nos próximos 60 dias (candidatos a acção do agente).
- `useAuth()` para `user`
- `useFocusEffect` para carregar `fetchRenewalCandidates(user.id)` (de `src/lib/agent.ts`)
- Se lista vazia: `<Text>` "No renewals in the next 60 days."
- Cada item: `RenewalCandidateCard` (novo componente) mostrando `contract.provider`, `contract.renewal_date`, dias até renovação (usar `daysUntil` de `@/lib/rulesEngine`), `onPress` navega para `router.push(/agent/${contract.id})`
- Título: "Zelanna Agent", subtítulo: "Review upcoming renewals — nothing happens without your approval."
- Segue o padrão visual de `alerts.tsx:67-105` (mesmos `styles.container`/`styles.content`/`styles.title`)

### `app/(dashboard)/agent/[contractId].tsx`

**Propósito:** ecrã de detalhe de um contrato a renovar — pesquisar alternativas, escolher acção, gerar rascunho, aprovar, confirmar envio.

Estado local: `contract: Contract | null`, `actions: AgentAction[]`, `activeAction: AgentAction | null` (a proposta em curso, se existir uma `status='proposed'` ou `'approved'` sem `executed_at`).

Fluxo de UI (sequencial, cada passo só aparece depois do anterior estar concluído):
1. Mostra dados do contrato (`provider`, `renewal_date`, `current_amount`) — reaproveitar `fetchContracts`/leitura directa por id se não existir `fetchContractById` (criar um `fetchContractById(id)` simples em `src/lib/contracts.ts` seguindo o padrão de `fetchTrustedPersonById` em `src/lib/estate.ts:143-151`, usando `.eq('id', id).maybeSingle()`)
2. Botão "Find alternatives" → chama `findAlternativesForAction`; se não há `activeAction`, cria uma primeiro com `proposeAgentAction({ userId, contractId, actionType: 'renegotiate' })` (acção por defeito; o utilizador escolhe `cancel` vs `renegotiate` no passo do rascunho, ver abaixo — `action_type` pode ser actualizado antes do rascunho ser gerado, adicionar `updateAgentActionType` a `src/lib/agent.ts` se necessário, ou simplesmente re-propor com o tipo certo antes de gerar o rascunho)
3. Resultado renderizado em `AlternativesList` (novo componente) — cada alternativa com badge "Unverified suggestion" (tone `'info'`)
4. Selector de acção: `cancel` | `renegotiate` (reaproveitar padrão de `ChipRow` em `src/components/ui/ChipRow.tsx`)
5. Botão "Generate draft" → chama `draftAction(activeAction.id, contract, selectedActionType)`
6. `DraftPreview` (novo componente) mostra `draft_content` completo, com botão "Copy to clipboard" (usar `expo-clipboard`, **novo pacote a instalar** — ver `## Ficheiros a Modificar` → `package.json`)
7. Botão "Approve this action" → `Alert.alert` de confirmação explícita, texto específico à acção (ex: `"Approve sending this cancellation request to ${provider}?"`), seguindo exactamente o padrão de `app/(dashboard)/estate/trusted-people/[id].tsx:75-92` — só no `onPress` do botão "Approve" chama `approveAgentAction(activeAction.id)`
8. Depois de aprovado: mostra novamente o rascunho (já aprovado, não editável) com botão "I've sent this" → `Alert.alert` de confirmação → `markAgentActionExecuted(activeAction.id, 'sent_manually')`
9. Botão "Reject" disponível em qualquer estado antes de `executed` → `Alert.alert` de confirmação → `rejectAgentAction(activeAction.id)`
10. `AgentActionHistory` (novo componente) no fundo do ecrã, lista `actions` (todas as propostas passadas para este contrato, incluindo rejeitadas), cada uma com `Badge` de estado

### `src/components/agent/RenewalCandidateCard.tsx`

Props: `{ entry: LifeCalendarEntry & { source: 'contract' } }`. Mostra `entry.contract.provider`, `entry.contract.renewal_date`, `daysUntil(entry.contract.renewal_date)`. Estilo: seguir `src/components/dashboard/InsightCard.tsx` (card com `colors.surfaceAlt`, `radius.md`).

### `src/components/agent/AlternativesList.tsx`

Props: `{ alternatives: AgentActionAlternative[] | null }`. Se `null`, não renderiza nada. Cada item: `providerName` em negrito + `note`, com `<Badge label="Unverified suggestion" tone="info" />` uma única vez no topo da lista (não por item).

### `src/components/agent/DraftPreview.tsx`

Props: `{ draft: string; onCopy: () => void }`. `<Text>` com o rascunho completo dentro de um `View` com `colors.surfaceAlt`, e `<Button title="Copy to clipboard" onPress={onCopy} variant="accent" />`.

### `src/components/agent/AgentActionHistory.tsx`

Props: `{ actions: AgentAction[] }`. Lista simples, cada linha: `action_type` + `<Badge>` de `status` (mapear tone: `proposed→'info'`, `approved→'warning'`, `executed→'success'`, `rejected→'critical'`, `failed→'critical'`) + data relevante (`approved_at`/`executed_at` se existirem).

## Ficheiros a Modificar

### `app/(dashboard)/_layout.tsx`
- [x] Adicionar `<Tabs.Screen name="agent" options={{ href: null }} />` (mesmo padrão de `alerts`/`estate` nas linhas 22-23) — não aparece na tab bar, acedido via "More"

### `app/(dashboard)/more.tsx`
- [x] Adicionar ao array `ITEMS` (linha 12-17): `{ key: 'agent', title: 'Zelanna Agent', subtitle: 'Renewals, alternatives and cancellation drafts.', route: '/agent' }`

### `src/lib/contracts.ts`
- [x] Adicionar `fetchContractById(id: string): Promise<Contract | null>`, seguindo exactamente o padrão de `fetchTrustedPersonById` (`src/lib/estate.ts:143-151`): `.from('contracts').select(CONTRACT_COLUMNS).eq('id', id).maybeSingle()`

### `package.json`
- [x] Instalar `expo-clipboard` via `npx expo install expo-clipboard` (necessário para o botão "Copy to clipboard" em `DraftPreview.tsx`)

## Fases de Implementação

### Fase 1: Schema e tipos
**Ficheiros:**
- Modificar `supabase/schema.sql` (tabela `agent_actions` + RLS)
- Criar `src/types/agent.ts`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros
- [x] `supabase db push` (ou aplicação manual do SQL) corre sem erro — corrido pelo utilizador fora desta sessão (sem projecto Supabase ligado neste ambiente de implementação)

**Critérios de sucesso (manuais):**
- [x] Confirmar no Supabase Studio que `agent_actions` tem RLS activo e as 3 policies (select/insert/update, todas `auth.uid() = user_id`)

### Fase 2: Edge Functions
**Ficheiros:**
- Criar `supabase/functions/agent-find-alternatives/index.ts`
- Criar `supabase/functions/agent-draft-action/index.ts`

**Critérios de sucesso (automáticos):**
- [x] `supabase functions deploy agent-find-alternatives agent-draft-action` sem erros — corrido pelo utilizador fora desta sessão

**Critérios de sucesso (manuais):**
- [x] Chamar `agent-find-alternatives` com um body de teste (ex: `{ provider: "Fidelidade", type: "insurance", currentAmount: 450 }`) via `curl`/Postman com um JWT válido e confirmar que devolve `{ alternatives: [...] }` com `note` sempre em tom de sugestão não verificada
- [x] Chamar `agent-draft-action` com um body de teste e confirmar que o rascunho nunca inventa datas/valores fora dos fornecidos e nunca se apresenta como já enviado

### Fase 3: Camada de dados no cliente
**Ficheiros:**
- Criar `src/lib/agent.ts`
- Modificar `src/lib/contracts.ts` (adicionar `fetchContractById`)

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros

**Critérios de sucesso (manuais):**
- [x] `fetchRenewalCandidates` devolve apenas entradas com `source: 'contract'` e dentro de 60 dias, testado com um contrato de teste com `renewal_date` a 30 dias
- [x] `approveAgentAction` chamado duas vezes sobre a mesma acção: a segunda chamada falha (nenhuma linha corresponde a `status='proposed'`), confirmando que `approved_at` não é reescrito

### Fase 4: UI
**Ficheiros:**
- Criar `app/(dashboard)/agent/_layout.tsx`, `app/(dashboard)/agent/index.tsx`, `app/(dashboard)/agent/[contractId].tsx`
- Criar `src/components/agent/RenewalCandidateCard.tsx`, `AlternativesList.tsx`, `DraftPreview.tsx`, `AgentActionHistory.tsx`
- Modificar `app/(dashboard)/_layout.tsx`, `app/(dashboard)/more.tsx`, `package.json`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros
- [x] `expo lint` passa sem warnings nos ficheiros desta feature (2 erros pré-existentes e sem relação, em `app/(auth)/login.tsx:60` e `app/onboarding/step3.tsx:19`, não tocados nesta implementação — `react/no-unescaped-entities`)

**Critérios de sucesso (manuais, no simulador):**
- [x] Com um contrato de teste a renovar em <60 dias, o ecrã "Zelanna Agent" (via More) mostra-o na lista
- [x] Tocar no contrato → "Find alternatives" → alternativas aparecem sempre com o badge "Unverified suggestion"
- [x] "Generate draft" → rascunho aparece completo, "Copy to clipboard" funciona
- [x] "Approve this action" pede confirmação explícita nomeando a acção e o fornecedor antes de aprovar
- [x] Fechar a app / navegar para outro ecrã sem aprovar → reabrir → a proposta continua em `status='proposed'`, nenhuma acção foi executada
- [x] "I've sent this" só aparece depois de aprovado, e marca `status='executed'`
- [x] "Reject" disponível antes de `executed`, e some do fluxo activo (passa para o histórico) depois de usado
- [x] Histórico no fundo do ecrã mostra todas as propostas passadas para aquele contrato, mesmo rejeitadas

## Estratégia de Testes

- **Unit:** nenhuma lógica de cálculo nova (datas reaproveitam `rulesEngine.ts`, já testado); se existirem testes unitários no projecto para `src/lib/*.ts`, adicionar cobertura para `fetchRenewalCandidates` (filtragem por `source`) e para as guardas de transição de estado em `agent.ts` (`.eq('status', ...)`).
- **Manual:** ver critérios de sucesso manuais de cada fase. Criar pelo menos um contrato de teste com `renewal_date` dentro de 60 dias e um fora, para confirmar a filtragem.

## Notas de Implementação

- **Regra #6 do CLAUDE.md aplica-se integralmente:** o LLM nunca decide datas nem calcula — `daysUntil`/`isExpiringSoon` de `rulesEngine.ts` são a única fonte de verdade para "60 dias". O LLM só (a) sugere alternativas via web search, sempre marcadas como não verificadas, e (b) escreve o texto do rascunho a partir de factos já fornecidos.
- **Nunca há aprovação implícita por silêncio/timeout** — não implementar nenhum job/cron que altere `status` automaticamente. Todas as transições de `agent_actions.status` acontecem exclusivamente por acção explícita do utilizador no ecrã `[contractId].tsx`.
- **`web_search` tool nunca usado antes neste codebase** — confirmar na documentação Anthropic actual o nome exacto do tool/beta header antes de implementar `agent-find-alternatives`; se a API tiver mudado a forma de activar web search, ajustar o `fetch` mantendo o resto do padrão (auth, tratamento de erro 502) igual ao de `explain-insight`.
- **`action_type` inicial em `proposeAgentAction` é sempre `'renegotiate'`** por ser a acção menos destrutiva; o utilizador pode trocar para `'cancel'` antes de gerar o rascunho (passo 4 do ecrã de detalhe). **Decisão tomada na implementação:** em vez de re-propor, `draftAction` (`src/lib/agent.ts`) faz `update({ draft_content, action_type })` num único pedido — actualiza o `action_type` para o valor escolhido no `ChipRow` no mesmo momento em que grava o rascunho, sem perder as alternativas já pesquisadas e sem precisar de um `updateAgentActionType` dedicado.
- **`status='failed'` fica sem UI nesta fase** — não construir nenhum caminho de código que o produza; existe só para schema forward-compatible com uma fase futura de execução automática (fora do âmbito de F14 tal como aprovada).
- **Nenhuma credencial de fornecedor é pedida ou guardada** — em nenhum ponto do fluxo (alternativas, rascunho, aprovação, confirmação de envio) a app autentica-se em nome do utilizador em portais externos, alinhado com `CLAUDE.md` → `## O que NÃO ser`.

## Referências

- Research: `thoughts/shared/research/2026-09-17-zelanna-agent.md`
- Ticket: `thoughts/shared/tickets/2026-09-17-zelanna-agent.md`
- Padrão de auth em Edge Function: `supabase/functions/explain-insight/index.ts:118-137`
- Padrão de confirmação explícita antes de acção irreversível: `app/(dashboard)/estate/trusted-people/[id].tsx:75-92`
- Padrão de janela de 60 dias já implementada: `src/lib/events.ts:13,116-137`
- Padrão de audit log mais próximo (mais simples): `supabase/schema.sql:544-571` (`estate_access_log`)
