import type { ExtractedDocumentData } from '@/types/documents';

export function daysUntil(dateISO: string, from: Date = new Date()): number {
  const target = new Date(dateISO);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - from.getTime()) / msPerDay);
}

export function isExpiringSoon(dateISO: string, thresholdDays: number = 30): boolean {
  const days = daysUntil(dateISO);
  return days >= 0 && days <= thresholdDays;
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
