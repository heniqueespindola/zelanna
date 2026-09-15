export type BillCategory =
  | 'water'
  | 'electricity'
  | 'gas'
  | 'internet'
  | 'mobile'
  | 'landline'
  | 'insurance';

export type BillingPeriod = 'monthly' | 'bimonthly' | 'yearly';

export interface Bill {
  id: string;
  user_id: string;
  provider: string;
  category: BillCategory | null;
  invoice_date: string | null;
  billing_period: BillingPeriod | null;
  amount: number | null;
  created_at: string;
}
