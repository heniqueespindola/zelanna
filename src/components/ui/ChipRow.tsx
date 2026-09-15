import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ChipRow<T>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
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
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipUnselected: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  chipText: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
  chipTextSelected: { fontWeight: '700' },
});
