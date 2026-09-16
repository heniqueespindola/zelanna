import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { TrustedPerson } from '@/types/estate';

interface Props {
  people: TrustedPerson[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function EmergencyPackTrustedPersonPicker({ people, selectedId, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Pressable style={[styles.chip, selectedId === null && styles.chipActive]} onPress={() => onSelect(null)}>
        <Text style={styles.chipText}>Just for me</Text>
      </Pressable>
      {people.map((person) => (
        <Pressable
          key={person.id}
          style={[styles.chip, selectedId === person.id && styles.chipActive]}
          onPress={() => onSelect(person.id)}
        >
          <Text style={styles.chipText}>{person.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontFamily: fonts.body, color: colors.white, fontWeight: '600' },
});
