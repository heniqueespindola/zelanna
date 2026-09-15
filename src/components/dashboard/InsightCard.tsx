import { View, Text, StyleSheet } from 'react-native';
import { fonts, spacing } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { Insight, InsightType } from '@/types/insights';

const TYPE_LABELS: Record<InsightType, string> = {
  price_increase: 'Price increase',
  renewal: 'Renewal',
  anomaly: 'Anomaly',
  recurring_increase: 'Recurring increase',
  coverage_gap: 'Coverage gap',
  coverage_expiring: 'Coverage expiring',
  return_deadline: 'Return deadline',
};

interface Props {
  insight: Insight;
}

export function InsightCard({ insight }: Props) {
  return (
    <View style={styles.row}>
      <Badge label={TYPE_LABELS[insight.type]} tone={insight.severity} />
      <Text style={styles.message}>{insight.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  message: { fontFamily: fonts.body, color: '#FFFFFF' },
});
