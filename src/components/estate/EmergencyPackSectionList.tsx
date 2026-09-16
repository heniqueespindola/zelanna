import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { Badge } from '@/components/ui/Badge';
import type { EmergencyPackData, EmergencyPackSection } from '@/types/emergencyPack';
import { EMERGENCY_PACK_SECTIONS, countForSection } from '@/lib/emergencyPack';

const SECTION_LABEL: Record<EmergencyPackSection, string> = {
  assets: 'Assets',
  important_documents: 'Important Documents',
  insurance: 'Insurance',
  properties: 'Properties',
  digital_assets: 'Digital Assets',
  instructions: 'Instructions',
};

interface Props {
  data: EmergencyPackData;
  selected: EmergencyPackSection[];
  permitted: EmergencyPackSection[] | null; // null = sem restrição (modo pessoal)
  onToggle: (section: EmergencyPackSection) => void;
}

export function EmergencyPackSectionList({ data, selected, permitted, onToggle }: Props) {
  return (
    <View style={styles.list}>
      {EMERGENCY_PACK_SECTIONS.map((section) => {
        const isSelected = selected.includes(section);
        const isAllowed = permitted === null || permitted.includes(section);
        const count = countForSection(data, section);
        return (
          <Pressable
            key={section}
            style={[styles.row, !isAllowed && styles.rowDisabled]}
            onPress={() => isAllowed && onToggle(section)}
          >
            <View>
              <Text style={styles.label}>{SECTION_LABEL[section]}</Text>
              {!isAllowed ? <Text style={styles.noPermission}>No permission granted for this person</Text> : null}
            </View>
            <Badge label={isSelected ? `${count} included` : `${count} available`} tone={isSelected ? 'success' : 'info'} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowDisabled: { opacity: 0.4 },
  label: { fontFamily: fonts.body, fontSize: 15, color: colors.white },
  noPermission: { fontFamily: fonts.body, fontSize: 12, color: colors.border, marginTop: 2 },
});
