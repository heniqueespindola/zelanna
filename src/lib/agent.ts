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
    .update({ draft_content: result.draft, action_type: actionType })
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
