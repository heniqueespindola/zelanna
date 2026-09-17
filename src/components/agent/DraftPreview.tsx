import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { Button } from '@/components/ui/Button';

interface Props {
  draft: string;
  onCopy: () => void;
}

export function DraftPreview({ draft, onCopy }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.draft}>{draft}</Text>
      <Button title="Copy to clipboard" onPress={onCopy} variant="accent" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  draft: { fontFamily: fonts.body, color: colors.white, lineHeight: 20 },
});
