import { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { colors, fonts, spacing } from '@/constants/theme';
import { ChipRow } from '@/components/ui/ChipRow';
import type { BillGroup } from '@/lib/bills';
import type { BillCategory } from '@/types/bills';

const CATEGORY_LABELS: Record<string, string> = {
  water: 'Water', electricity: 'Electricity', gas: 'Gas', internet: 'Internet',
  mobile: 'Mobile', landline: 'Landline', insurance: 'Insurance',
};

interface Props {
  groups: BillGroup[];
}

export function BillEvolutionChart({ groups }: Props) {
  const categories = useMemo(() => Array.from(new Set(groups.map((g) => g.category))), [groups]);
  const [category, setCategory] = useState<BillCategory | null>(categories[0] ?? null);
  const providersInCategory = useMemo(
    () => groups.filter((g) => g.category === category),
    [groups, category]
  );
  const [provider, setProvider] = useState<string | null>(null);

  if (categories.length === 0) {
    return <Text style={styles.empty}>No bills yet to chart.</Text>;
  }

  const selectedGroup =
    providersInCategory.find((g) => g.provider === provider) ?? providersInCategory[0];
  const series = selectedGroup
    ? [...selectedGroup.bills]
        .filter((b) => b.amount !== null && b.invoice_date !== null)
        .reverse()
        .map((b) => ({ value: b.amount as number, label: (b.invoice_date as string).slice(5) }))
    : [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Monthly evolution</Text>
      <ChipRow
        options={categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))}
        value={category as BillCategory}
        onChange={(c) => { setCategory(c); setProvider(null); }}
      />
      <ChipRow
        options={providersInCategory.map((g) => ({ value: g.provider, label: g.provider }))}
        value={selectedGroup?.provider ?? ''}
        onChange={setProvider}
      />
      {series.length < 2 ? (
        <Text style={styles.empty}>Not enough history for this provider yet.</Text>
      ) : (
        <LineChart
          data={series}
          color={colors.primary}
          thickness={2}
          yAxisTextStyle={{ color: colors.border }}
          xAxisLabelTextStyle={{ color: colors.border }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  empty: { fontFamily: fonts.body, color: colors.border },
});
