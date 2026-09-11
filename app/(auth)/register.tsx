import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getAuthErrorMessage, isValidEmail } from '@/lib/authErrors';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleRegister = async () => {
    if (!email || !isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setSubmitting(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp(email, password);
    if (signUpError) {
      setError(getAuthErrorMessage(signUpError));
    } else if (needsEmailConfirmation) {
      setConfirmationSent(true);
    }
    setSubmitting(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      {confirmationSent ? (
        <View style={styles.confirmation}>
          <Text style={styles.confirmationText}>
            We sent a confirmation link to <Text style={styles.bold}>{email}</Text>. Confirm your
            email, then log in.
          </Text>
          <Link href="/(auth)/login" style={styles.link}>
            Back to login
          </Link>
        </View>
      ) : (
        <>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          <Input
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title="Sign up" onPress={handleRegister} loading={submitting} />

          <Link href="/(auth)/login" style={styles.link}>
            Already have an account? Log in
          </Link>
        </>
      )}
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
  confirmation: {
    gap: spacing.md,
  },
  confirmationText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.white,
    textAlign: 'center',
  },
  bold: {
    fontWeight: '700',
  },
  error: {
    fontFamily: fonts.body,
    color: colors.critical,
    textAlign: 'center',
  },
  link: {
    fontFamily: fonts.body,
    color: colors.accent,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
