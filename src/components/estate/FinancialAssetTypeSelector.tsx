import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { FinancialAssetType } from '@/types/estate';

interface Props {
  value: FinancialAssetType | null;
  onChange: (value: FinancialAssetType) => void;
}

const OPTIONS: { value: FinancialAssetType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'investment', label: 'Investment' },
  { value: 'pension', label: 'Pension' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'property', label: 'Property' },
  { value: 'other', label: 'Other' },
];

export function FinancialAssetTypeSelector({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Type</Text>
      <View style={styles.chips}>
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.white,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipUnselected: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.white,
  },
  chipTextSelected: {
    fontWeight: '700',
  },
});
