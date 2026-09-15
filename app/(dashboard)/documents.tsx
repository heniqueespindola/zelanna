import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { GmailImportQueue } from '@/components/documents/GmailImportQueue';

export default function DocumentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Documents</Text>
      <Text style={styles.subtitle}>Upload bills, warranties, insurance and contracts.</Text>

      <GmailImportQueue />
      <DocumentUpload onExtracted={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border, marginBottom: spacing.md },
});
