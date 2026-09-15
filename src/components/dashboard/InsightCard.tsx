import { View, Text, StyleSheet } from 'react-native';
import { fonts, spacing } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { Insight } from '@/types/insights';

interface Props {
  insight: Insight;
}

export function InsightCard({ insight }: Props) {
  return (
    <View style={styles.row}>
      <Badge label={insight.type === 'price_increase' ? 'Price increase' : 'Renewal'} tone={insight.severity} />
      <Text style={styles.message}>{insight.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  message: { fontFamily: fonts.body, color: '#FFFFFF' },
});
