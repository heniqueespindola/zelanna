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
