import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { AgentActionAlternative } from '@/types/agent';

interface Props {
  alternatives: AgentActionAlternative[] | null;
}

export function AlternativesList({ alternatives }: Props) {
  if (!alternatives) return null;

  return (
    <View style={styles.container}>
      <Badge label="Unverified suggestion" tone="info" />
      {alternatives.map((alt, index) => (
        <View key={`${alt.providerName}-${index}`} style={styles.item}>
          <Text style={styles.providerName}>{alt.providerName}</Text>
          <Text style={styles.note}>{alt.note}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  item: { gap: 2 },
  providerName: { fontFamily: fonts.body, fontWeight: '700', color: colors.white },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
});
