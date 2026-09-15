import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { ChipRow } from '@/components/ui/ChipRow';
import type { BillPeriodFilter } from '@/types/bills';

interface Props {
  value: BillPeriodFilter;
  onChange: (value: BillPeriodFilter) => void;
}

const OPTIONS: { value: BillPeriodFilter; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export function PeriodFilter({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Period</Text>
      <ChipRow options={OPTIONS} value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
});
