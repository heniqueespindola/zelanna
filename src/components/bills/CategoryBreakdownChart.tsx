import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { colors, fonts, spacing } from '@/constants/theme';
import type { CategoryTotal } from '@/lib/bills';

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
  totals: CategoryTotal[];
}

export function CategoryBreakdownChart({ totals }: Props) {
  if (totals.length === 0) {
    return <Text style={styles.empty}>No bills in this period yet.</Text>;
  }

  const data = totals.map((t) => ({
    value: t.monthlyTotal,
    label: CATEGORY_LABELS[t.category] ?? t.category,
    frontColor: colors.primary,
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cost by category (monthly)</Text>
      <BarChart
        data={data}
        barWidth={28}
        spacing={20}
        noOfSections={4}
        yAxisTextStyle={{ color: colors.border }}
        xAxisLabelTextStyle={{ color: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  empty: { fontFamily: fonts.body, color: colors.border },
});
