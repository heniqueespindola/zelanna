import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';

export default function BillsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bills</Text>
      <Text style={styles.subtitle}>
        Track water, electricity, gas, internet, phone and insurance over time.
      </Text>

      {/* TODO: F06/F07 — Bills Intelligence (histórico) + Bills Dashboard (gráficos e anomalias) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
