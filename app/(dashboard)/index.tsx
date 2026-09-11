import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export default function DashboardScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>What's happening with your life admin.</Text>

      {/* TODO: F08 — Alerts e Life Calendar básico (eventos + insights recentes) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upcoming renewals</Text>
        <Text style={styles.cardBody}>No renewals tracked yet.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent insights</Text>
        <Text style={styles.cardBody}>Upload a document to get your first insight.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardTitle: { fontFamily: fonts.body, fontWeight: '600', color: colors.white, marginBottom: spacing.xs },
  cardBody: { fontFamily: fonts.body, color: colors.border },
});
