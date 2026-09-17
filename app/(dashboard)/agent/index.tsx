import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchRenewalCandidates } from '@/lib/agent';
import { RenewalCandidateCard } from '@/components/agent/RenewalCandidateCard';
import type { LifeCalendarEntry } from '@/lib/events';

export default function AgentScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [candidates, setCandidates] = useState<Extract<LifeCalendarEntry, { source: 'contract' }>[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const entries = await fetchRenewalCandidates(user.id);
    setCandidates(entries as Extract<LifeCalendarEntry, { source: 'contract' }>[]);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Zelanna Agent</Text>
      <Text style={styles.subtitle}>Review upcoming renewals — nothing happens without your approval.</Text>

      {candidates === null ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : candidates.length === 0 ? (
        <Text style={styles.subtitle}>No renewals in the next 60 days.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {candidates.map((entry) => (
            <Pressable key={entry.event.id} onPress={() => router.push(`/agent/${entry.contract.id}`)}>
              <RenewalCandidateCard entry={entry} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
