import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zelanna</Text>
      <Text style={styles.subtitle}>
        Know what you own, what you pay for, what protects you.
      </Text>

      {/* TODO: F01 — formulário de login com Supabase Auth (email + password) */}

      <Pressable style={styles.button}>
        <Text style={styles.buttonText}>Log in</Text>
      </Pressable>

      <Link href="/(auth)/register" style={styles.link}>
        Don't have an account? Sign up
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDarkest,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.border,
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
  link: {
    fontFamily: fonts.body,
    color: colors.accent,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
