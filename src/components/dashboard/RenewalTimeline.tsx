import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { daysUntil } from '@/lib/rulesEngine';
import type { Contract } from '@/types/contracts';

interface Props {
  contracts: Contract[];
}

export function RenewalTimeline({ contracts }: Props) {
  if (contracts.length === 0) {
    return <Text style={styles.empty}>No renewals tracked yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {contracts.map((contract) => (
        <Text key={contract.id} style={styles.row}>
          {contract.provider} — renews in {daysUntil(contract.renewal_date!)} days
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.body, color: colors.border },
  list: { gap: spacing.xs },
  row: { fontFamily: fonts.body, color: colors.border },
});
