import { supabase } from '@/lib/supabase';
import {
  average,
  daysUntil,
  isAnomaly,
  isExpiringSoon,
  isSignificantIncrease,
  percentageChange,
  type InsightSeverity,
} from '@/lib/rulesEngine';
import { normalizeProvider } from '@/lib/contracts';
import { fetchBillHistory } from '@/lib/bills';
import type { Contract } from '@/types/contracts';
import type { Bill } from '@/types/bills';
import type {
  AnomalyInsightData,
  Insight,
  InsightType,
  PriceIncreaseInsightData,
  RenewalInsightData,
} from '@/types/insights';

const INSIGHT_COLUMNS = 'id, user_id, contract_id, bill_id, type, severity, data, message, created_at';
const RENEWAL_THRESHOLD_DAYS = 30;
const PRICE_INCREASE_THRESHOLD_PERCENT = 10;
const ANOMALY_WINDOW_MONTHS = 6;

function fallbackMessage(
  type: InsightType,
  data: PriceIncreaseInsightData | RenewalInsightData | AnomalyInsightData
): string {
  if (type === 'price_increase') {
    const d = data as PriceIncreaseInsightData;
    return `${d.provider}: price went from €${d.previousAmount} to €${d.currentAmount} (+${d.changePercent.toFixed(1)}%).`;
  }
  if (type === 'anomaly') {
    const d = data as AnomalyInsightData;
    return `${d.provider}: paid €${d.currentAmount.toFixed(2)}, ${d.deviationPercent.toFixed(1)}% above your ${d.periodMonths}-month average of €${d.averageAmount.toFixed(2)}.`;
  }
  const d = data as RenewalInsightData;
  return `${d.provider} renews in ${d.daysUntilRenewal} days (${d.renewalDate}).`;
}

async function explainInsight(
  type: InsightType,
  data: PriceIncreaseInsightData | RenewalInsightData | AnomalyInsightData
): Promise<string> {
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
  data: PriceIncreaseInsightData | RenewalInsightData | AnomalyInsightData;
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
        severity: days <= 7 ? 'critical' : 'warning',
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
