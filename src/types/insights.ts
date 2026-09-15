import type { InsightSeverity } from '@/lib/rulesEngine';

export type InsightType = 'price_increase' | 'renewal' | 'anomaly' | 'recurring_increase' | 'coverage_gap';

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

export interface RecurringIncreaseInsightData {
  provider: string;
  category: string | null;
  monthsConsecutive: number;
  amounts: number[]; // mais recente primeiro, length = monthsConsecutive
}

export interface CoverageGapInsightData {
  assetName: string;
  coverageType: 'warranty' | 'insurance';
  reason: 'missing' | 'expired';
  endDate: string | null;
}

export type InsightData =
  | PriceIncreaseInsightData
  | RenewalInsightData
  | AnomalyInsightData
  | RecurringIncreaseInsightData
  | CoverageGapInsightData;

export interface Insight {
  id: string;
  user_id: string;
  contract_id: string | null;
  bill_id: string | null;
  asset_id: string | null;
  coverage_type: 'warranty' | 'insurance' | null;
  type: InsightType;
  severity: InsightSeverity;
  data: InsightData;
  message: string;
  resolved_at: string | null;
  created_at: string;
}

export type AlertsFilter = 'all' | 'coverage' | 'bills' | 'renewal';
