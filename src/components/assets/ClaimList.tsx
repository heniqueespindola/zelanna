import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { deleteClaim } from '@/lib/coverage';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { Claim, ClaimStatus } from '@/types/assets';

interface Props {
  claims: Claim[];
  onDeleted: (claimId: string) => void;
}

const STATUS_LABEL: Record<ClaimStatus, string> = {
  open: 'Open',
  approved: 'Approved',
  denied: 'Denied',
  resolved: 'Resolved',
};

const STATUS_TONE: Record<ClaimStatus, BadgeTone> = {
  open: 'info',
  approved: 'success',
  denied: 'critical',
  resolved: 'success',
};

export function ClaimList({ claims, onDeleted }: Props) {
  const handleDelete = (claim: Claim) => {
    Alert.alert('Delete claim?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteClaim(claim.id);
          onDeleted(claim.id);
        },
      },
    ]);
  };

  if (claims.length === 0) {
    return <Text style={styles.empty}>No claims recorded.</Text>;
  }

  return (
    <View style={styles.list}>
      {claims.map((claim) => (
        <View key={claim.id} style={styles.row}>
          <View style={styles.info}>
            <Badge label={STATUS_LABEL[claim.status]} tone={STATUS_TONE[claim.status]} />
            {claim.description ? <Text style={styles.description}>{claim.description}</Text> : null}
            {claim.result ? <Text style={styles.description}>{claim.result}</Text> : null}
          </View>
          <Pressable onPress={() => handleDelete(claim)}>
            <Text style={styles.deleteLink}>Delete</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  info: { gap: spacing.xs, flexShrink: 1 },
  description: { fontFamily: fonts.body, color: colors.border },
  deleteLink: { fontFamily: fonts.body, color: colors.critical, fontWeight: '600' },
  empty: { fontFamily: fonts.body, color: colors.border },
});
