import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export default function DocumentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Documents</Text>
      <Text style={styles.subtitle}>Upload bills, warranties, insurance and contracts.</Text>

      {/* TODO: F03 — upload (Supabase Storage) + extração via Vision LLM Edge Function */}
      <Pressable style={styles.uploadButton}>
        <Text style={styles.uploadButtonText}>+ Upload document</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border, marginBottom: spacing.md },
  uploadButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  uploadButtonText: { fontFamily: fonts.body, color: colors.accent, fontWeight: '600' },
});
