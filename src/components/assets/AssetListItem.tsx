import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { evaluateCoverage, type CoverageStatus } from '@/lib/rulesEngine';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { Asset } from '@/types/assets';
import type { CoverageRecord } from '@/types/coverage';

interface Props {
  asset: Asset;
  records: CoverageRecord[];
}

const STATUS_LABEL: Record<CoverageStatus, string> = {
  active: 'Covered',
  expiring_soon: 'Expiring soon',
  expired: 'Not covered',
};

const STATUS_TONE: Record<CoverageStatus, BadgeTone> = {
  active: 'success',
  expiring_soon: 'warning',
  expired: 'critical',
};

export function AssetListItem({ asset, records }: Props) {
  const router = useRouter();
  const { primary } = evaluateCoverage(records);
  const status: CoverageStatus = primary?.status ?? 'expired';

  return (
    <Pressable style={styles.row} onPress={() => router.push(`/assets/${asset.id}`)}>
      <View style={styles.info}>
        <Text style={styles.name}>{asset.name}</Text>
        {asset.category ? <Text style={styles.category}>{asset.category}</Text> : null}
      </View>
      <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  info: { gap: spacing.xs },
  name: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  category: { fontFamily: fonts.body, fontSize: 13, color: colors.border, textTransform: 'capitalize' },
});
