import { supabase } from '@/lib/supabase';
import {
  average,
  coverageGapSeverity,
  daysUntil,
  evaluateCoverage,
  expiringSeverity,
  findDuplicateCoverage,
  isAnomaly,
  isExpiringSoon,
  isProtectionGapCandidate,
  isRecurringIncrease,
  isSignificantIncrease,
  isUnusedSubscription,
  monthsSince,
  percentageChange,
  type InsightSeverity,
} from '@/lib/rulesEngine';
import { fetchContracts, fetchLatestDocumentDateByContract, normalizeProvider } from '@/lib/contracts';
import { fetchBillHistory } from '@/lib/bills';
import { fetchAssetIdsWithDocuments, fetchAssets, fetchCoverageForUser } from '@/lib/coverage';
import type { Contract } from '@/types/contracts';
import type { Bill } from '@/types/bills';
import type { CoverageRecord } from '@/types/coverage';
import type {
  AlertsFilter,
  AnomalyInsightData,
  CoverageExpiringInsightData,
  CoverageGapInsightData,
  DuplicateInsuranceInsightData,
  Insight,
  InsightData,
  InsightType,
  MissingDocumentationInsightData,
  PriceIncreaseInsightData,
  ProtectionGapInsightData,
  RecurringIncreaseInsightData,
  RenewalInsightData,
  ReturnDeadlineInsightData,
  UnusedSubscriptionInsightData,
} from '@/types/insights';

const INSIGHT_COLUMNS =
  'id, user_id, contract_id, bill_id, asset_id, coverage_type, type, severity, data, message, resolved_at, created_at';
export const RENEWAL_THRESHOLD_DAYS = 30;
const PRICE_INCREASE_THRESHOLD_PERCENT = 10;
const ANOMALY_WINDOW_MONTHS = 6;
const RECURRING_INCREASE_PERIODS = 3;
const UNUSED_SUBSCRIPTION_THRESHOLD_MONTHS = 12;
const PROTECTION_GAP_VALUE_THRESHOLD = 500;

function fallbackMessage(type: InsightType, data: InsightData): string {
  if (type === 'price_increase') {
    const d = data as PriceIncreaseInsightData;
    return `${d.provider}: price went from €${d.previousAmount} to €${d.currentAmount} (+${d.changePercent.toFixed(1)}%).`;
  }
  if (type === 'anomaly') {
    const d = data as AnomalyInsightData;
    return `${d.provider}: paid €${d.currentAmount.toFixed(2)}, ${d.deviationPercent.toFixed(1)}% above your ${d.periodMonths}-month average of €${d.averageAmount.toFixed(2)}.`;
  }
  if (type === 'recurring_increase') {
    const d = data as RecurringIncreaseInsightData;
    return `${d.provider}: price has increased for ${d.monthsConsecutive} consecutive billing periods.`;
  }
  if (type === 'coverage_gap') {
    const d = data as CoverageGapInsightData;
    if (d.reason === 'expired') {
      return `${d.assetName}: ${d.coverageType} coverage expired${d.endDate ? ` on ${d.endDate}` : ''}.`;
    }
    return `${d.assetName}: no ${d.coverageType} coverage on record.`;
  }
  if (type === 'coverage_expiring') {
    const d = data as CoverageExpiringInsightData;
    return `${d.assetName}: ${d.coverageType} coverage expires in ${d.daysUntilExpiry} days (${d.endDate}).`;
  }
  if (type === 'return_deadline') {
    const d = data as ReturnDeadlineInsightData;
    return `${d.assetName}: return window closes in ${d.daysUntilDeadline} days (${d.returnDeadline}).`;
  }
  if (type === 'unused_subscription') {
    const d = data as UnusedSubscriptionInsightData;
    return `${d.provider}: no invoice uploaded in over ${Math.floor(d.monthsSinceLastDocument)} months — this subscription may not be in use.`;
  }
  if (type === 'duplicate_insurance') {
    const d = data as DuplicateInsuranceInsightData;
    return `${d.assetName}: ${d.count} active insurance policies found on this asset — you may be paying for duplicate coverage.`;
  }
  if (type === 'missing_documentation') {
    const d = data as MissingDocumentationInsightData;
    return d.subjectType === 'asset'
      ? `${d.subjectName}: no document on file for this asset.`
      : `${d.subjectName}: no document on file for this contract.`;
  }
  if (type === 'protection_gap') {
    const d = data as ProtectionGapInsightData;
    return `${d.assetName}: worth over €${d.thresholdValue}, but has no active coverage.`;
  }
  const d = data as RenewalInsightData;
  return `${d.provider} renews in ${d.daysUntilRenewal} days (${d.renewalDate}).`;
}

async function explainInsight(type: InsightType, data: InsightData): Promise<string> {
  const { data: result, error } = await supabase.functions.invoke<{ message: string }>(
    'explain-insight',
    { body: { type, ...data } }
  );
  if (error || !result?.message) throw new Error('Explanation failed');
  return result.message;
}

async function saveInsight(params: {
  userId: string;
  contractId?: string;
  billId?: string;
  type: InsightType;
  severity: InsightSeverity;
  data: InsightData;
}): Promise<Insight> {
  let message: string;
  try {
    message = await explainInsight(params.type, params.data);
  } catch {
    message = fallbackMessage(params.type, params.data);
  }

  const { data, error } = await supabase
    .from('insights')
    .insert({
      user_id: params.userId,
      contract_id: params.contractId ?? null,
      bill_id: params.billId ?? null,
      type: params.type,
      severity: params.severity,
      data: params.data,
      message,
    })
    .select(INSIGHT_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save insight');
  return data;
}

async function upsertCoverageGapInsight(params: {
  userId: string;
  assetId: string;
  severity: InsightSeverity;
  data: CoverageGapInsightData;
}): Promise<Insight> {
  let message: string;
  try {
    message = await explainInsight('coverage_gap', params.data);
  } catch {
    message = fallbackMessage('coverage_gap', params.data);
  }

  const { data, error } = await supabase
    .from('insights')
    .upsert(
      {
        user_id: params.userId,
        asset_id: params.assetId,
        coverage_type: params.data.coverageType,
        type: 'coverage_gap' as const,
        severity: params.severity,
        data: params.data,
        message,
      },
      { onConflict: 'asset_id,type,coverage_type' }
    )
    .select(INSIGHT_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save coverage gap insight');
  return data;
}

export async function generateCoverageGapInsights(userId: string): Promise<Insight[]> {
  const [assets, coverage] = await Promise.all([fetchAssets(userId), fetchCoverageForUser()]);
  if (assets.length === 0) return [];

  const coverageByAsset = new Map<string, CoverageRecord[]>();
  for (const record of coverage) {
    const list = coverageByAsset.get(record.asset_id) ?? [];
    list.push(record);
    coverageByAsset.set(record.asset_id, list);
  }

  const created: Insight[] = [];
  for (const asset of assets) {
    const { gaps } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
    for (const gap of gaps) {
      const data: CoverageGapInsightData = {
        assetName: asset.name,
        coverageType: gap.type,
        reason: gap.reason,
        endDate: gap.end_date,
      };
      created.push(
        await upsertCoverageGapInsight({
          userId,
          assetId: asset.id,
          severity: coverageGapSeverity(gap.reason),
          data,
        })
      );
    }
  }
  return created;
}

async function upsertAssetScopedInsight(params: {
  userId: string;
  assetId: string;
  type: 'coverage_expiring' | 'return_deadline' | 'duplicate_insurance' | 'missing_documentation' | 'protection_gap';
  coverageType?: 'warranty' | 'insurance' | 'extension';
  severity: InsightSeverity;
  data: InsightData;
}): Promise<Insight> {
  let message: string;
  try {
    message = await explainInsight(params.type, params.data);
  } catch {
    message = fallbackMessage(params.type, params.data);
  }

  const onConflict = params.coverageType ? 'asset_id,type,coverage_type' : 'asset_id,type';
  const { data, error } = await supabase
    .from('insights')
    .upsert(
      {
        user_id: params.userId,
        asset_id: params.assetId,
        coverage_type: params.coverageType ?? null,
        type: params.type,
        severity: params.severity,
        data: params.data,
        message,
      },
      { onConflict }
    )
    .select(INSIGHT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save ${params.type} insight`);
  return data;
}

export async function generateCoverageExpiringInsights(userId: string): Promise<Insight[]> {
  const [assets, coverage] = await Promise.all([fetchAssets(userId), fetchCoverageForUser()]);
  if (assets.length === 0) return [];

  const coverageByAsset = new Map<string, CoverageRecord[]>();
  for (const record of coverage) {
    const list = coverageByAsset.get(record.asset_id) ?? [];
    list.push(record);
    coverageByAsset.set(record.asset_id, list);
  }

  const created: Insight[] = [];
  for (const asset of assets) {
    const { primary } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
    if (!primary || primary.status !== 'expiring_soon' || !primary.end_date) continue;
    const days = daysUntil(primary.end_date);
    const data: CoverageExpiringInsightData = {
      assetName: asset.name,
      coverageType: primary.type,
      provider: primary.provider,
      endDate: primary.end_date,
      daysUntilExpiry: days,
    };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'coverage_expiring',
        coverageType: primary.type,
        severity: expiringSeverity(days),
        data,
      })
    );
  }
  return created;
}

export async function generateReturnDeadlineInsights(userId: string): Promise<Insight[]> {
  const assets = await fetchAssets(userId);
  const created: Insight[] = [];
  for (const asset of assets) {
    if (!asset.return_deadline || !isExpiringSoon(asset.return_deadline, RENEWAL_THRESHOLD_DAYS)) continue;
    const days = daysUntil(asset.return_deadline);
    const data: ReturnDeadlineInsightData = {
      assetName: asset.name,
      returnDeadline: asset.return_deadline,
      daysUntilDeadline: days,
    };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'return_deadline',
        severity: expiringSeverity(days),
        data,
      })
    );
  }
  return created;
}

async function upsertContractScopedInsight(params: {
  userId: string;
  contractId: string;
  type: 'unused_subscription' | 'missing_documentation';
  severity: InsightSeverity;
  data: InsightData;
}): Promise<Insight> {
  let message: string;
  try {
    message = await explainInsight(params.type, params.data);
  } catch {
    message = fallbackMessage(params.type, params.data);
  }
  const { data, error } = await supabase
    .from('insights')
    .upsert(
      {
        user_id: params.userId,
        contract_id: params.contractId,
        type: params.type,
        severity: params.severity,
        data: params.data,
        message,
      },
      { onConflict: 'contract_id,type' }
    )
    .select(INSIGHT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save ${params.type} insight`);
  return data;
}

export async function generateUnusedSubscriptionInsights(userId: string): Promise<Insight[]> {
  const [contracts, latestDocByContract] = await Promise.all([
    fetchContracts(userId),
    fetchLatestDocumentDateByContract(userId),
  ]);
  const created: Insight[] = [];
  for (const contract of contracts) {
    if (contract.type !== 'subscription') continue;
    const referenceDate = latestDocByContract.get(contract.id) ?? contract.start_date;
    if (!isUnusedSubscription(referenceDate, UNUSED_SUBSCRIPTION_THRESHOLD_MONTHS)) continue;
    const data: UnusedSubscriptionInsightData = {
      provider: contract.provider,
      monthsSinceLastDocument: Math.floor(monthsSince(referenceDate as string)),
      thresholdMonths: UNUSED_SUBSCRIPTION_THRESHOLD_MONTHS,
    };
    created.push(
      await upsertContractScopedInsight({
        userId,
        contractId: contract.id,
        type: 'unused_subscription',
        severity: 'info',
        data,
      })
    );
  }
  return created;
}

export async function generateDuplicateInsuranceInsights(userId: string): Promise<Insight[]> {
  const [assets, coverage] = await Promise.all([fetchAssets(userId), fetchCoverageForUser()]);
  if (assets.length === 0) return [];

  const coverageByAsset = new Map<string, CoverageRecord[]>();
  for (const record of coverage) {
    const list = coverageByAsset.get(record.asset_id) ?? [];
    list.push(record);
    coverageByAsset.set(record.asset_id, list);
  }

  const created: Insight[] = [];
  for (const asset of assets) {
    const duplicates = findDuplicateCoverage(coverageByAsset.get(asset.id) ?? [], 'insurance');
    if (duplicates.length < 2) continue;
    const data: DuplicateInsuranceInsightData = {
      assetName: asset.name,
      providers: duplicates.map((d) => d.provider),
      count: duplicates.length,
    };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'duplicate_insurance',
        severity: 'warning',
        data,
      })
    );
  }
  return created;
}

export async function generateMissingDocumentationInsights(userId: string): Promise<Insight[]> {
  const [assets, contracts, assetIdsWithDocs, latestDocByContract] = await Promise.all([
    fetchAssets(userId),
    fetchContracts(userId),
    fetchAssetIdsWithDocuments(userId),
    fetchLatestDocumentDateByContract(userId),
  ]);

  const created: Insight[] = [];

  for (const asset of assets) {
    if (assetIdsWithDocs.has(asset.id)) continue;
    const data: MissingDocumentationInsightData = { subjectType: 'asset', subjectName: asset.name };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'missing_documentation',
        severity: 'info',
        data,
      })
    );
  }

  for (const contract of contracts) {
    if (latestDocByContract.has(contract.id)) continue;
    const data: MissingDocumentationInsightData = { subjectType: 'contract', subjectName: contract.provider };
    created.push(
      await upsertContractScopedInsight({
        userId,
        contractId: contract.id,
        type: 'missing_documentation',
        severity: 'info',
        data,
      })
    );
  }

  return created;
}

export async function generateProtectionGapInsights(userId: string): Promise<Insight[]> {
  const [assets, coverage] = await Promise.all([fetchAssets(userId), fetchCoverageForUser()]);
  if (assets.length === 0) return [];

  const coverageByAsset = new Map<string, CoverageRecord[]>();
  for (const record of coverage) {
    const list = coverageByAsset.get(record.asset_id) ?? [];
    list.push(record);
    coverageByAsset.set(record.asset_id, list);
  }

  const created: Insight[] = [];
  for (const asset of assets) {
    if (!isProtectionGapCandidate(asset.purchase_price, PROTECTION_GAP_VALUE_THRESHOLD)) continue;
    const { primary } = evaluateCoverage(coverageByAsset.get(asset.id) ?? []);
    if (primary) continue;
    const data: ProtectionGapInsightData = {
      assetName: asset.name,
      purchasePrice: asset.purchase_price as number,
      thresholdValue: PROTECTION_GAP_VALUE_THRESHOLD,
    };
    created.push(
      await upsertAssetScopedInsight({
        userId,
        assetId: asset.id,
        type: 'protection_gap',
        severity: 'warning',
        data,
      })
    );
  }
  return created;
}

export async function generateInsightsForContract(params: {
  userId: string;
  contract: Contract;
  previousAmount: number | null;
  includePriceIncrease?: boolean;
}): Promise<Insight[]> {
  const { userId, contract, previousAmount, includePriceIncrease = true } = params;
  const created: Insight[] = [];

  if (includePriceIncrease && previousAmount !== null && contract.current_amount !== null) {
    const changePercent = percentageChange(contract.current_amount, previousAmount);
    if (isSignificantIncrease(contract.current_amount, previousAmount, PRICE_INCREASE_THRESHOLD_PERCENT)) {
      const data: PriceIncreaseInsightData = {
        provider: contract.provider,
        previousAmount,
        currentAmount: contract.current_amount,
        changeAmount: contract.current_amount - previousAmount,
        changePercent,
      };
      created.push(
        await saveInsight({ userId, contractId: contract.id, type: 'price_increase', severity: 'warning', data })
      );
    }
  }

  if (contract.renewal_date && isExpiringSoon(contract.renewal_date, RENEWAL_THRESHOLD_DAYS)) {
    const days = daysUntil(contract.renewal_date);
    const data: RenewalInsightData = {
      provider: contract.provider,
      renewalDate: contract.renewal_date,
      daysUntilRenewal: days,
    };
    created.push(
      await saveInsight({
        userId,
        contractId: contract.id,
        type: 'renewal',
        severity: expiringSeverity(days),
        data,
      })
    );
  }

  return created;
}

export async function generateInsightsForBill(params: { userId: string; bill: Bill }): Promise<Insight[]> {
  const { userId, bill } = params;
  const created: Insight[] = [];
  if (!bill.category || bill.amount === null || bill.invoice_date === null) return created;

  const providerNormalized = normalizeProvider(bill.provider);
  // fetchBillHistory orders by invoice_date desc; keep only bills strictly before this one
  // so the comparison always uses the bill immediately preceding it in time, regardless of
  // the order in which invoices were uploaded/confirmed.
  const priorBills = (await fetchBillHistory({ userId, category: bill.category, providerNormalized })).filter(
    (b) => b.id !== bill.id && b.invoice_date !== null && b.invoice_date < (bill.invoice_date as string)
  );

  if (priorBills.length >= 1 && priorBills[0].amount !== null) {
    const previous = priorBills[0];
    const changePercent = percentageChange(bill.amount, previous.amount as number);
    if (isSignificantIncrease(bill.amount, previous.amount as number, PRICE_INCREASE_THRESHOLD_PERCENT)) {
      const data: PriceIncreaseInsightData = {
        provider: bill.provider,
        previousAmount: previous.amount as number,
        currentAmount: bill.amount,
        changeAmount: bill.amount - (previous.amount as number),
        changePercent,
      };
      created.push(await saveInsight({ userId, billId: bill.id, type: 'price_increase', severity: 'warning', data }));
    }
  }

  const last6 = priorBills
    .slice(0, ANOMALY_WINDOW_MONTHS)
    .map((b) => b.amount)
    .filter((a): a is number => a !== null);
  if (last6.length === ANOMALY_WINDOW_MONTHS) {
    const avg6 = average(last6);
    if (isAnomaly(bill.amount, avg6)) {
      const data: AnomalyInsightData = {
        provider: bill.provider,
        category: bill.category,
        currentAmount: bill.amount,
        averageAmount: avg6,
        deviationAmount: bill.amount - avg6,
        deviationPercent: percentageChange(bill.amount, avg6),
        periodMonths: ANOMALY_WINDOW_MONTHS,
      };
      created.push(await saveInsight({ userId, billId: bill.id, type: 'anomaly', severity: 'warning', data }));
    }
  }

  const recentAmounts = [bill.amount, ...priorBills.map((b) => b.amount)].filter(
    (a): a is number => a !== null
  );
  if (isRecurringIncrease(recentAmounts, RECURRING_INCREASE_PERIODS)) {
    const data: RecurringIncreaseInsightData = {
      provider: bill.provider,
      category: bill.category,
      monthsConsecutive: RECURRING_INCREASE_PERIODS,
      amounts: recentAmounts.slice(0, RECURRING_INCREASE_PERIODS),
    };
    created.push(
      await saveInsight({ userId, billId: bill.id, type: 'recurring_increase', severity: 'warning', data })
    );
  }

  return created;
}

export async function fetchRecentInsights(userId: string, limit: number = 5): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('insights')
    .select(INSIGHT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Could not load insights');
  return data ?? [];
}

export async function fetchBillInsights(userId: string, limit: number = 10): Promise<Insight[]> {
  const { data, error } = await supabase
    .from('insights')
    .select(INSIGHT_COLUMNS)
    .eq('user_id', userId)
    .not('bill_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Could not load bill insights');
  return data ?? [];
}

export async function fetchUpcomingRenewals(userId: string): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('contracts')
    .select('id, user_id, provider, type, start_date, renewal_date, current_amount, created_at')
    .eq('user_id', userId)
    .not('renewal_date', 'is', null)
    .order('renewal_date', { ascending: true });
  if (error) throw new Error('Could not load renewals');
  return (data ?? []).filter((c) => c.renewal_date && isExpiringSoon(c.renewal_date, RENEWAL_THRESHOLD_DAYS));
}

export async function fetchAllInsights(
  userId: string,
  params?: { includeResolved?: boolean }
): Promise<Insight[]> {
  let query = supabase
    .from('insights')
    .select(INSIGHT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (!params?.includeResolved) query = query.is('resolved_at', null);
  const { data, error } = await query;
  if (error) throw new Error('Could not load insights');
  return data ?? [];
}

export async function resolveInsight(insightId: string): Promise<void> {
  const { error } = await supabase
    .from('insights')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', insightId);
  if (error) throw new Error('Could not resolve insight');
}

export function filterInsightsByBucket(insights: Insight[], filter: AlertsFilter): Insight[] {
  if (filter === 'all') return insights;
  if (filter === 'coverage')
    return insights.filter(
      (i) =>
        i.type === 'coverage_gap' ||
        i.type === 'coverage_expiring' ||
        i.type === 'return_deadline' ||
        i.type === 'duplicate_insurance' ||
        i.type === 'protection_gap' ||
        i.type === 'missing_documentation'
    );
  if (filter === 'bills') return insights.filter((i) => i.bill_id !== null);
  if (filter === 'subscriptions') return insights.filter((i) => i.type === 'unused_subscription');
  return insights.filter((i) => i.type === 'renewal');
}
