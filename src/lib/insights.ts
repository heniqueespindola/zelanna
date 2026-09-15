import { supabase } from '@/lib/supabase';
import {
  daysUntil,
  isExpiringSoon,
  isSignificantIncrease,
  percentageChange,
  type InsightSeverity,
} from '@/lib/rulesEngine';
import type { Contract } from '@/types/contracts';
import type { Insight, InsightType, PriceIncreaseInsightData, RenewalInsightData } from '@/types/insights';

const INSIGHT_COLUMNS = 'id, user_id, contract_id, type, severity, data, message, created_at';
const RENEWAL_THRESHOLD_DAYS = 30;
const PRICE_INCREASE_THRESHOLD_PERCENT = 10;

function fallbackMessage(type: InsightType, data: PriceIncreaseInsightData | RenewalInsightData): string {
  if (type === 'price_increase') {
    const d = data as PriceIncreaseInsightData;
    return `${d.provider}: price went from €${d.previousAmount} to €${d.currentAmount} (+${d.changePercent.toFixed(1)}%).`;
  }
  const d = data as RenewalInsightData;
  return `${d.provider} renews in ${d.daysUntilRenewal} days (${d.renewalDate}).`;
}

async function explainInsight(
  type: InsightType,
  data: PriceIncreaseInsightData | RenewalInsightData
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
  contractId: string;
  type: InsightType;
  severity: InsightSeverity;
  data: PriceIncreaseInsightData | RenewalInsightData;
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
      contract_id: params.contractId,
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
}): Promise<Insight[]> {
  const { userId, contract, previousAmount } = params;
  const created: Insight[] = [];

  if (previousAmount !== null && contract.current_amount !== null) {
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
