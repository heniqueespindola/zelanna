import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';

export default function CoverageScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coverage Check</Text>
      <Text style={styles.subtitle}>
        Select an asset to see if it's covered by a warranty or insurance.
      </Text>

      {/* TODO: F04 — Coverage Check (regras determinísticas sobre coverage.start_date/end_date) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
