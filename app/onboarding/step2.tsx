import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export default function OnboardingStep2() {
  return (
    <View style={styles.container}>
      <Text style={styles.step}>2 / 3</Text>
      <Text style={styles.title}>Upload your first document</Text>
      <Text style={styles.subtitle}>
        A bill, a warranty or an insurance policy — Zelanna will read it for you.
      </Text>

      {/* TODO: F03 — upload de documento + preview da extração Vision LLM */}

      <Link href="/onboarding/step3" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Continue</Text>
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
