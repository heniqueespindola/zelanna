import { useCallback, useMemo, useState } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchBills,
  groupBills,
  calculateBillTotals,
  calculateCategoryTotals,
  filterBillsByPeriod,
} from '@/lib/bills';
import { fetchBillInsights } from '@/lib/insights';
import { fetchUpcomingBillRenewals, type UpcomingBillRenewal } from '@/lib/events';
import { BillGroupCard } from '@/components/bills/BillGroupCard';
import { PeriodFilter } from '@/components/bills/PeriodFilter';
import { BillsSummaryCard } from '@/components/bills/BillsSummaryCard';
import { CategoryBreakdownChart } from '@/components/bills/CategoryBreakdownChart';
import { BillEvolutionChart } from '@/components/bills/BillEvolutionChart';
import { BillsAlertsSection } from '@/components/bills/BillsAlertsSection';
import { RenewalTimeline } from '@/components/dashboard/RenewalTimeline';
import type { Bill, BillPeriodFilter } from '@/types/bills';
import type { Insight } from '@/types/insights';

export default function BillsScreen() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [renewals, setRenewals] = useState<UpcomingBillRenewal[] | null>(null);
  const [period, setPeriod] = useState<BillPeriodFilter>('all');

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      Promise.all([fetchBills(user.id), fetchBillInsights(user.id), fetchUpcomingBillRenewals(user.id)]).then(
        ([loadedBills, loadedInsights, loadedRenewals]) => {
          setBills(loadedBills);
          setInsights(loadedInsights);
          setRenewals(loadedRenewals);
        }
      );
    }, [user])
  );

  const allGroups = useMemo(() => (bills ? groupBills(bills) : []), [bills]);
  const filteredGroups = useMemo(
    () => (bills ? groupBills(filterBillsByPeriod(bills, period)) : []),
    [bills, period]
  );
  const totals = useMemo(() => calculateBillTotals(filteredGroups), [filteredGroups]);
  const categoryTotals = useMemo(() => calculateCategoryTotals(filteredGroups), [filteredGroups]);

  if (bills === null || insights === null || renewals === null) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Bills</Text>
        <Text style={styles.subtitle}>Loading…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bills</Text>
      <Text style={styles.subtitle}>Track water, electricity, gas, internet, phone and insurance over time.</Text>

      {allGroups.length === 0 ? (
        <Text style={styles.subtitle}>Upload an invoice and set its category to start building history.</Text>
      ) : (
        <>
          <PeriodFilter value={period} onChange={setPeriod} />
          <BillsSummaryCard monthlyTotal={totals.monthlyTotal} annualTotal={totals.annualTotal} />
          <CategoryBreakdownChart totals={categoryTotals} />
          <BillEvolutionChart groups={filteredGroups} />
          <BillsAlertsSection insights={insights} />
          <RenewalTimeline contracts={renewals.map((r) => r.contract)} />
        </>
      )}

      {allGroups.map((group) => (
        <BillGroupCard key={`${group.category}::${group.provider}`} group={group} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
