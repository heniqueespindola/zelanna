import type { ExtractedDocumentData } from '@/types/documents';
import type { CoverageRecord, CoverageType } from '@/types/coverage';
import type { BillingPeriod } from '@/types/bills';

export function daysUntil(dateISO: string, from: Date = new Date()): number {
  const target = new Date(dateISO);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - from.getTime()) / msPerDay);
}

export function isExpiringSoon(dateISO: string, thresholdDays: number = 30): boolean {
  const days = daysUntil(dateISO);
  return days >= 0 && days <= thresholdDays;
}

export type CoverageStatus = 'active' | 'expiring_soon' | 'expired';

export function getCoverageStatus(endDateISO: string | null, thresholdDays: number = 30): CoverageStatus {
  if (!endDateISO) return 'active';
  const days = daysUntil(endDateISO);
  if (days < 0) return 'expired';
  if (days <= thresholdDays) return 'expiring_soon';
  return 'active';
}

const COVERAGE_TYPE_RANK: Record<CoverageType, number> = { extension: 3, insurance: 2, warranty: 1 };

export interface CoverageEvaluation {
  primary: (CoverageRecord & { type: CoverageType; status: CoverageStatus }) | null;
  gaps: { type: 'warranty' | 'insurance'; reason: 'missing' | 'expired'; end_date: string | null }[];
}

export function evaluateCoverage(records: CoverageRecord[], thresholdDays: number = 30): CoverageEvaluation {
  const withStatus = records
    .filter((r): r is CoverageRecord & { type: CoverageType } => r.type !== null)
    .map((r) => ({ ...r, status: getCoverageStatus(r.end_date, thresholdDays) }));

  const inForce = withStatus.filter((r) => r.status !== 'expired');

  const primary = inForce.length
    ? [...inForce].sort((a, b) => {
        const rank = COVERAGE_TYPE_RANK[b.type] - COVERAGE_TYPE_RANK[a.type];
        if (rank !== 0) return rank;
        const aTime = a.end_date ? new Date(a.end_date).getTime() : Infinity;
        const bTime = b.end_date ? new Date(b.end_date).getTime() : Infinity;
        return bTime - aTime;
      })[0]
    : null;

  const gaps: CoverageEvaluation['gaps'] = [];
  for (const type of ['warranty', 'insurance'] as const) {
    const recordsOfType = withStatus.filter((r) => r.type === type);
    const hasInForce = recordsOfType.some((r) => r.status !== 'expired');
    if (hasInForce) continue;
    const mostRecentExpired = recordsOfType[0] ?? null;
    gaps.push({ type, reason: mostRecentExpired ? 'expired' : 'missing', end_date: mostRecentExpired?.end_date ?? null });
  }

  return { primary, gaps };
}

export function coverageGapSeverity(reason: 'missing' | 'expired'): InsightSeverity {
  return reason === 'expired' ? 'critical' : 'warning';
}

export function expiringSeverity(daysUntilDue: number): InsightSeverity {
  return daysUntilDue <= 7 ? 'critical' : 'warning';
}

export function percentageChange(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}

export function isSignificantIncrease(
  current: number,
  previous: number,
  thresholdPercent: number = 10
): boolean {
  return percentageChange(current, previous) > thresholdPercent;
}

export function isAnomaly(current: number, average: number, thresholdPercent: number = 25): boolean {
  return percentageChange(current, average) > thresholdPercent;
}

export function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function monthlyEquivalent(amount: number, billingPeriod: BillingPeriod | null): number {
  if (billingPeriod === 'yearly') return amount / 12;
  if (billingPeriod === 'bimonthly') return amount / 2;
  return amount; // 'monthly' ou null assume mensal
}

export function annualEquivalent(amount: number, billingPeriod: BillingPeriod | null): number {
  if (billingPeriod === 'yearly') return amount;
  if (billingPeriod === 'bimonthly') return amount * 6;
  return amount * 12; // 'monthly' ou null assume mensal
}

export function isRecurringIncrease(amountsDesc: number[], consecutivePeriods: number = 3): boolean {
  if (amountsDesc.length < consecutivePeriods) return false;
  for (let i = 0; i < consecutivePeriods - 1; i++) {
    if (amountsDesc[i] <= amountsDesc[i + 1]) return false;
  }
  return true;
}

export function monthsSince(dateISO: string, from: Date = new Date()): number {
  return -daysUntil(dateISO, from) / 30.44;
}

export function isUnusedSubscription(
  referenceDateISO: string | null,
  thresholdMonths: number = 12,
  from: Date = new Date()
): boolean {
  if (!referenceDateISO) return false;
  return monthsSince(referenceDateISO, from) >= thresholdMonths;
}

export function findDuplicateCoverage(
  records: CoverageRecord[],
  type: CoverageType,
  thresholdDays: number = 30
): (CoverageRecord & { type: CoverageType })[] {
  const inForce = records
    .filter((r): r is CoverageRecord & { type: CoverageType } => r.type === type)
    .filter((r) => getCoverageStatus(r.end_date, thresholdDays) !== 'expired');
  return inForce.length >= 2 ? inForce : [];
}

export function isProtectionGapCandidate(
  purchasePrice: number | null,
  thresholdValue: number = 500
): boolean {
  return purchasePrice !== null && purchasePrice >= thresholdValue;
}

export type InsightSeverity = 'info' | 'warning' | 'critical';

export interface OnboardingInsight {
  headline: string;
  message: string;
  severity: InsightSeverity;
}

export function generateOnboardingInsight(doc: ExtractedDocumentData): OnboardingInsight {
  const headline = "Here's what we found";

  if (doc.expiry_date) {
    const days = daysUntil(doc.expiry_date);

    if (days < 0) {
      return { headline, message: `This expired ${Math.abs(days)} days ago.`, severity: 'critical' };
    }

    if (isExpiringSoon(doc.expiry_date)) {
      return { headline, message: `This expires in ${days} days.`, severity: 'warning' };
    }

    return { headline, message: `This is valid until ${doc.expiry_date}.`, severity: 'info' };
  }

  if (doc.provider) {
    return {
      headline,
      message: `We've saved your ${doc.document_type} from ${doc.provider}. Upload more documents to unlock renewal alerts and coverage checks.`,
      severity: 'info',
    };
  }

  return {
    headline,
    message: "We've saved your document. Upload more to start unlocking insights.",
    severity: 'info',
  };
}
