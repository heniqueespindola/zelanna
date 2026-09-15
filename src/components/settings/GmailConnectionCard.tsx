import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useGmailConnection } from '@/hooks/useGmailConnection';
import { Button } from '@/components/ui/Button';

export function GmailConnectionCard() {
  const { status, loading, connecting, error, connect, disconnect } = useGmailConnection();

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  if (status?.connected) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Connected as {status.googleEmail}</Text>
        <Text style={styles.subtitle}>
          Last synced: {status.lastSyncedAt ?? 'never'}
        </Text>
        <Button title="Disconnect Gmail" onPress={disconnect} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Gmail</Text>
      <Text style={styles.subtitle}>
        Zelanna will search Gmail for bills and receipts using your permission. It never reads your inbox freely.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Connect Gmail" variant="accent" onPress={connect} loading={connecting} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.white,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.border,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.critical,
  },
});
