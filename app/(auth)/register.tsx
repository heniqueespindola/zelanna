import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export default function RegisterScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      {/* TODO: F01 — formulário de registo com Supabase Auth (email + password) */}

      <Pressable style={styles.button}>
        <Text style={styles.buttonText}>Sign up</Text>
      </Pressable>

      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Log in
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
    fontSize: 24,
    color: colors.white,
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
