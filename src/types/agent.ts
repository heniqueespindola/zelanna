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
