import { supabase } from '@/lib/supabase';
import { normalizeProvider } from '@/lib/contracts';
import { average, percentageChange, monthlyEquivalent, annualEquivalent } from '@/lib/rulesEngine';
import type { Bill, BillCategory, BillingPeriod, BillPeriodFilter } from '@/types/bills';

const BILL_COLUMNS = 'id, user_id, provider, category, invoice_date, billing_period, amount, created_at';

export async function saveBill(params: {
  userId: string;
  documentId: string;
  provider: string;
  category: BillCategory;
  invoiceDate: string | null;
  billingPeriod: BillingPeriod | null;
  amount: number;
}): Promise<Bill> {
  const { data, error } = await supabase
    .from('bills')
    .insert({
      user_id: params.userId,
      provider: params.provider,
      category: params.category,
      invoice_date: params.invoiceDate,
      billing_period: params.billingPeriod,
      amount: params.amount,
    })
    .select(BILL_COLUMNS)
    .single();
  if (error || !data) throw new Error('Could not save bill');
  await supabase.from('documents').update({ bill_id: data.id }).eq('id', params.documentId);
  return data;
}

export async function fetchBillHistory(params: {
  userId: string;
  category: BillCategory;
  providerNormalized: string;
}): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_COLUMNS)
    .eq('user_id', params.userId)
    .eq('category', params.category)
    .eq('provider_normalized', params.providerNormalized)
    .order('invoice_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error('Could not load bill history');
  return data ?? [];
}

export async function fetchBills(userId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_COLUMNS)
    .eq('user_id', userId)
    .order('invoice_date', { ascending: false, nullsFirst: false });
  if (error) throw new Error('Could not load bills');
  return data ?? [];
}

export interface BillGroup {
  category: BillCategory;
  provider: string;
  bills: Bill[]; // desc by invoice_date
  latestChangePercent: number | null;
  average6: number | null;
  average12: number | null;
}

export function groupBills(bills: Bill[]): BillGroup[] {
  const map = new Map<string, BillGroup>();
  for (const bill of bills) {
    if (!bill.category) continue;
    const key = `${bill.category}::${normalizeProvider(bill.provider)}`;
    const existing = map.get(key);
    if (existing) existing.bills.push(bill);
    else map.set(key, { category: bill.category, provider: bill.provider, bills: [bill], latestChangePercent: null, average6: null, average12: null });
  }
  return Array.from(map.values()).map((group) => {
    const amounts = group.bills.map((b) => b.amount).filter((a): a is number => a !== null);
    const [latest, previous] = group.bills;
    const latestChangePercent =
      latest.amount !== null && previous?.amount != null ? percentageChange(latest.amount, previous.amount) : null;
    const average6 = amounts.length >= 6 ? average(amounts.slice(0, 6)) : null;
    const average12 = amounts.length >= 12 ? average(amounts.slice(0, 12)) : null;
    return { ...group, latestChangePercent, average6, average12 };
  });
}

export function calculateBillTotals(groups: BillGroup[]): { monthlyTotal: number; annualTotal: number } {
  let monthlyTotal = 0;
  let annualTotal = 0;
  for (const group of groups) {
    const latest = group.bills[0];
    if (latest.amount === null) continue;
    monthlyTotal += monthlyEquivalent(latest.amount, latest.billing_period);
    annualTotal += annualEquivalent(latest.amount, latest.billing_period);
  }
  return { monthlyTotal, annualTotal };
}

export interface CategoryTotal {
  category: BillCategory;
  monthlyTotal: number;
}

export function calculateCategoryTotals(groups: BillGroup[]): CategoryTotal[] {
  const map = new Map<BillCategory, number>();
  for (const group of groups) {
    const latest = group.bills[0];
    if (latest.amount === null) continue;
    const value = monthlyEquivalent(latest.amount, latest.billing_period);
    map.set(group.category, (map.get(group.category) ?? 0) + value);
  }
  return Array.from(map.entries()).map(([category, monthlyTotal]) => ({ category, monthlyTotal }));
}

export function filterBillsByPeriod(bills: Bill[], period: BillPeriodFilter, now: Date = new Date()): Bill[] {
  if (period === 'all') return bills;
  const rangeStart = new Date(now);
  if (period === 'month') rangeStart.setMonth(rangeStart.getMonth() - 1);
  else if (period === 'quarter') rangeStart.setMonth(rangeStart.getMonth() - 3);
  else rangeStart.setFullYear(rangeStart.getFullYear() - 1);
  return bills.filter((b) => {
    if (!b.invoice_date) return false;
    const invoiceDate = new Date(b.invoice_date);
    return invoiceDate >= rangeStart && invoiceDate <= now;
  });
}
