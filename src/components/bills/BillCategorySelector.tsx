import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { BillCategory } from '@/types/bills';

interface Props {
  value: BillCategory | null;
  onChange: (value: BillCategory | null) => void;
}

const OPTIONS: { value: BillCategory | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'water', label: 'Water' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'gas', label: 'Gas' },
  { value: 'internet', label: 'Internet' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'landline', label: 'Landline' },
  { value: 'insurance', label: 'Insurance' },
];

export function BillCategorySelector({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Bill category</Text>
      <View style={styles.chips}>
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.label}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipUnselected: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  chipText: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
  chipTextSelected: { fontWeight: '700' },
});
