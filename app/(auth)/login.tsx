import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getAuthErrorMessage, isValidEmail } from '@/lib/authErrors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email || !isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) setError(getAuthErrorMessage(signInError));
    setSubmitting(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zelanna</Text>
      <Text style={styles.subtitle}>
        Know what you own, what you pay for, what protects you.
      </Text>

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Log in" onPress={handleLogin} loading={submitting} />

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
