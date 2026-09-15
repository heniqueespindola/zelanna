import { View, Text, StyleSheet } from 'react-native';
import { fonts, spacing, colors } from '@/constants/theme';
import { InsightCard } from '@/components/dashboard/InsightCard';
import type { Insight } from '@/types/insights';

interface Props {
  insights: Insight[];
}

export function BillsAlertsSection({ insights }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Anomalies and recurring increases</Text>
      {insights.length === 0 ? (
        <Text style={styles.empty}>No anomalies or recurring increases detected yet.</Text>
      ) : (
        insights.map((insight) => <InsightCard key={insight.id} insight={insight} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  title: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  empty: { fontFamily: fonts.body, color: colors.border },
});
