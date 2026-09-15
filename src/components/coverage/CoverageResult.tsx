import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { evaluateCoverage, daysUntil, type CoverageEvaluation } from '@/lib/rulesEngine';
import { Badge } from '@/components/ui/Badge';
import type { Asset } from '@/types/assets';
import type { CoverageRecord } from '@/types/coverage';

interface Props {
  asset: Asset;
  records: CoverageRecord[];
}

function gapMessage(gap: CoverageEvaluation['gaps'][number]): string {
  const label = gap.type === 'warranty' ? 'warranty' : 'insurance';
  if (gap.reason === 'missing') return `No ${label} on file for this asset.`;
  return `Your ${label} expired on ${gap.end_date}.`;
}

function nextActionText(primary: NonNullable<CoverageEvaluation['primary']>): string | null {
  if (!primary.end_date) return null;
  if (primary.status === 'expiring_soon') {
    return `Renew with ${primary.provider ?? 'your provider'} by ${primary.end_date}.`;
  }
  return `Renews on ${primary.end_date}.`;
}

export function CoverageResult({ asset, records }: Props) {
  const { primary, gaps } = evaluateCoverage(records);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{asset.name}</Text>

      {primary ? (
        <View style={styles.section}>
          <Badge
            label={primary.status === 'expiring_soon' ? 'Expiring soon' : 'Covered'}
            tone={primary.status === 'expiring_soon' ? 'warning' : 'success'}
          />
          <Text style={styles.text}>{primary.provider ?? 'Unknown provider'}</Text>
          {primary.status === 'expiring_soon' && primary.end_date ? (
            <Text style={styles.text}>{daysUntil(primary.end_date)} days left</Text>
          ) : null}
          {nextActionText(primary) ? <Text style={styles.text}>{nextActionText(primary)}</Text> : null}
        </View>
      ) : (
        <Badge label="Not covered" tone="critical" />
      )}

      {gaps.map((gap) => (
        <Text key={gap.type} style={styles.text}>
          {gapMessage(gap)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.white,
  },
  section: {
    gap: spacing.xs,
  },
  text: {
    fontFamily: fonts.body,
    color: colors.white,
  },
});
