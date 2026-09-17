import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { daysUntil } from '@/lib/rulesEngine';
import type { LifeCalendarEntry } from '@/lib/events';

interface Props {
  entry: Extract<LifeCalendarEntry, { source: 'contract' }>;
}

export function RenewalCandidateCard({ entry }: Props) {
  const { contract } = entry;
  const days = contract.renewal_date ? daysUntil(contract.renewal_date) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.provider}>{contract.provider}</Text>
      {contract.renewal_date && (
        <Text style={styles.detail}>
          Renews {contract.renewal_date}
          {days !== null ? ` — in ${days} days` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  provider: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  detail: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
});
