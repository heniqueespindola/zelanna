import type { InsightSeverity } from '@/lib/rulesEngine';

export type InsightType = 'price_increase' | 'renewal' | 'anomaly';

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

export interface AnomalyInsightData {
  provider: string;
  category: string | null;
  currentAmount: number;
  averageAmount: number;
  deviationAmount: number;
  deviationPercent: number;
  periodMonths: number;
}

export interface Insight {
  id: string;
  user_id: string;
  contract_id: string | null;
  bill_id: string | null;
  type: InsightType;
  severity: InsightSeverity;
  data: PriceIncreaseInsightData | RenewalInsightData | AnomalyInsightData;
  message: string;
  created_at: string;
}
