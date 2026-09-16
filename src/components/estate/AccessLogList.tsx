import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { EstateAccessLogEntry, EstateSection } from '@/types/estate';

interface Props {
  entries: EstateAccessLogEntry[];
}

const SECTION_LABEL: Record<EstateSection, string> = {
  digital_assets: 'Digital Assets',
  financial_assets: 'Financial Assets',
  important_documents: 'Important Documents',
  assets: 'Warranty Vault',
  coverage: 'Coverage',
  contracts: 'Insurance Contracts',
  instructions: 'Instructions',
};

export function AccessLogList({ entries }: Props) {
  if (entries.length === 0) {
    return <Text style={styles.empty}>No access recorded yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.row}>
          <Text style={styles.section}>{SECTION_LABEL[entry.section]}</Text>
          <Text style={styles.date}>{new Date(entry.accessed_at).toLocaleString()}</Text>
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
  section: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  date: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
  empty: { fontFamily: fonts.body, color: colors.border },
});
