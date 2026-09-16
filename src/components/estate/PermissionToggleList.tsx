import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { grantPermission, revokePermission } from '@/lib/estate';
import { Badge } from '@/components/ui/Badge';
import type { EstateSection } from '@/types/estate';

interface Props {
  trustedPersonId: string;
  granted: EstateSection[];
  onChanged: (granted: EstateSection[]) => void;
}

const SECTIONS: { value: EstateSection; label: string }[] = [
  { value: 'digital_assets', label: 'Digital Assets' },
  { value: 'financial_assets', label: 'Financial Assets' },
  { value: 'important_documents', label: 'Important Documents' },
  { value: 'assets', label: 'Warranty Vault' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'instructions', label: 'Instructions' },
];

export function PermissionToggleList({ trustedPersonId, granted, onChanged }: Props) {
  const handleToggle = async (section: EstateSection) => {
    const isGranted = granted.includes(section);
    if (isGranted) {
      await revokePermission(trustedPersonId, section);
      onChanged(granted.filter((s) => s !== section));
    } else {
      await grantPermission(trustedPersonId, section);
      onChanged([...granted, section]);
    }
  };

  return (
    <View style={styles.list}>
      {SECTIONS.map((section) => {
        const isGranted = granted.includes(section.value);
        return (
          <Pressable key={section.value} style={styles.row} onPress={() => handleToggle(section.value)}>
            <Text style={styles.label}>{section.label}</Text>
            <Badge label={isGranted ? 'Shared' : 'No access'} tone={isGranted ? 'success' : 'info'} />
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
  label: { fontFamily: fonts.body, fontSize: 15, color: colors.white },
});
