import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export default function OnboardingStep3() {
  return (
    <View style={styles.container}>
      <Text style={styles.step}>3 / 3</Text>
      <Text style={styles.badge}>✨ Here's what we found</Text>
      <Text style={styles.title}>Your first insight</Text>
      <Text style={styles.subtitle}>
        {/* TODO: F02/F03 — este é o "Aha Moment" gerado a partir do documento carregado */}
        This is where the first insight from your uploaded document appears —
        e.g. a warranty expiry date or a coverage gap.
      </Text>

      <Link href="/(dashboard)" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Go to dashboard</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgLight,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  step: {
    fontFamily: fonts.body,
    color: colors.surfaceAlt,
    textAlign: 'center',
  },
  badge: {
    fontFamily: fonts.body,
    color: colors.accent,
    textAlign: 'center',
    fontWeight: '600',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.black,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.surfaceAlt,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.body,
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
