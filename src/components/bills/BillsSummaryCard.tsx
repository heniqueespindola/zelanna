import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

interface Props {
  monthlyTotal: number;
  annualTotal: number;
}

export function BillsSummaryCard({ monthlyTotal, annualTotal }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Estimated monthly</Text>
        <Text style={styles.value}>€{monthlyTotal.toFixed(2)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Estimated annual</Text>
        <Text style={styles.value}>€{annualTotal.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: fonts.body, color: colors.border },
  value: { fontFamily: fonts.body, fontWeight: '700', color: colors.white, fontSize: 18 },
});
