import type { InsightSeverity } from '@/lib/rulesEngine';

export type InsightType =
  | 'price_increase'
  | 'renewal'
  | 'anomaly'
  | 'recurring_increase'
  | 'coverage_gap'
  | 'coverage_expiring'
  | 'return_deadline'
  | 'unused_subscription'
  | 'duplicate_insurance'
  | 'missing_documentation'
  | 'protection_gap';

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

export interface CoverageExpiringInsightData {
  assetName: string;
  coverageType: 'warranty' | 'insurance' | 'extension';
  provider: string | null;
  endDate: string;
  daysUntilExpiry: number;
}

export interface ReturnDeadlineInsightData {
  assetName: string;
  returnDeadline: string;
  daysUntilDeadline: number;
}

export interface UnusedSubscriptionInsightData {
  provider: string;
  monthsSinceLastDocument: number;
  thresholdMonths: number;
}

export interface DuplicateInsuranceInsightData {
  assetName: string;
  providers: (string | null)[];
  count: number;
}

export interface MissingDocumentationInsightData {
  subjectType: 'asset' | 'contract';
  subjectName: string;
}

export interface ProtectionGapInsightData {
  assetName: string;
  purchasePrice: number;
  thresholdValue: number;
}

export type InsightData =
  | PriceIncreaseInsightData
  | RenewalInsightData
  | AnomalyInsightData
  | RecurringIncreaseInsightData
  | CoverageGapInsightData
  | CoverageExpiringInsightData
  | ReturnDeadlineInsightData
  | UnusedSubscriptionInsightData
  | DuplicateInsuranceInsightData
  | MissingDocumentationInsightData
  | ProtectionGapInsightData;

export interface Insight {
  id: string;
  user_id: string;
  contract_id: string | null;
  bill_id: string | null;
  asset_id: string | null;
  coverage_type: 'warranty' | 'insurance' | 'extension' | null;
  type: InsightType;
  severity: InsightSeverity;
  data: InsightData;
  message: string;
  resolved_at: string | null;
  created_at: string;
}

export type AlertsFilter = 'all' | 'coverage' | 'bills' | 'renewal' | 'subscriptions';
