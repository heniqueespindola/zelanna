import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { ContractCategoryTotal } from '@/lib/contracts';

const TYPE_LABELS: Record<string, string> = {
  insurance: 'Insurance',
  utility: 'Utility',
  subscription: 'Subscription',
  other: 'Other',
};

interface Props {
  totals: ContractCategoryTotal[];
  combinedMonthlyTotal: number;
}

export function ContractCostSummaryCard({ totals, combinedMonthlyTotal }: Props) {
  if (totals.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Contracts & subscriptions (monthly)</Text>
      {totals.map((t) => (
        <View key={t.type} style={styles.row}>
          <Text style={styles.label}>{TYPE_LABELS[t.type] ?? t.type}</Text>
          <Text style={styles.value}>€{t.monthlyTotal.toFixed(2)}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Combined total (bills + contracts)</Text>
        <Text style={styles.totalValue}>€{combinedMonthlyTotal.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: fonts.body, color: colors.border },
  value: { fontFamily: fonts.body, color: colors.white },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  totalLabel: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  totalValue: { fontFamily: fonts.body, fontWeight: '700', color: colors.accent, fontSize: 16 },
});
