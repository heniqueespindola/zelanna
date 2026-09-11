import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export default function OnboardingStep1() {
  return (
    <View style={styles.container}>
      <Text style={styles.step}>1 / 3</Text>
      <Text style={styles.title}>What matters most to you?</Text>
      <Text style={styles.subtitle}>
        Protecting assets · Tracking expenses · Preparing your digital estate
      </Text>

      {/* TODO: F02 — multi-select do objetivo principal */}

      <Link href="/onboarding/step2" asChild>
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
