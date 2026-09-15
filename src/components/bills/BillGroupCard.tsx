import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { BillGroup } from '@/lib/bills';

const CATEGORY_LABELS: Record<string, string> = {
  water: 'Water',
  electricity: 'Electricity',
  gas: 'Gas',
  internet: 'Internet',
  mobile: 'Mobile',
  landline: 'Landline',
  insurance: 'Insurance',
};

interface Props {
  group: BillGroup;
}

export function BillGroupCard({ group }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {CATEGORY_LABELS[group.category] ?? group.category} — {group.provider}
        </Text>
        {group.latestChangePercent !== null ? (
          <Badge
            label={`${group.latestChangePercent > 0 ? '+' : ''}${group.latestChangePercent.toFixed(1)}%`}
            tone={group.latestChangePercent > 10 ? 'warning' : 'info'}
          />
        ) : null}
      </View>
      {group.bills.map((bill) => (
        <View key={bill.id} style={styles.row}>
          <Text style={styles.rowText}>{bill.invoice_date ?? '—'}</Text>
          <Text style={styles.rowText}>{bill.amount !== null ? `€${bill.amount.toFixed(2)}` : '—'}</Text>
        </View>
      ))}
      {group.average6 !== null ? (
        <Text style={styles.average}>6-month average: €{group.average6.toFixed(2)}</Text>
      ) : null}
      {group.average12 !== null ? (
        <Text style={styles.average}>12-month average: €{group.average12.toFixed(2)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowText: { fontFamily: fonts.body, color: colors.border },
  average: { fontFamily: fonts.body, fontSize: 12, color: colors.border, marginTop: spacing.xs },
});
