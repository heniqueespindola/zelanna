import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchUpcomingRenewals, fetchRecentInsights } from '@/lib/insights';
import { RenewalTimeline } from '@/components/dashboard/RenewalTimeline';
import { InsightCard } from '@/components/dashboard/InsightCard';
import type { Contract } from '@/types/contracts';
import type { Insight } from '@/types/insights';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [renewals, setRenewals] = useState<Contract[] | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      Promise.all([fetchUpcomingRenewals(user.id), fetchRecentInsights(user.id)]).then(
        ([loadedRenewals, loadedInsights]) => {
          setRenewals(loadedRenewals);
          setInsights(loadedInsights);
        }
      );
    }, [user])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>What&apos;s happening with your life admin.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upcoming renewals</Text>
        {renewals === null ? (
          <Text style={styles.cardBody}>Loading…</Text>
        ) : (
          <RenewalTimeline contracts={renewals} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent insights</Text>
        {insights === null ? (
          <Text style={styles.cardBody}>Loading…</Text>
        ) : insights.length === 0 ? (
          <Text style={styles.cardBody}>Upload a document to get your first insight.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.body, fontWeight: '600', color: colors.white, marginBottom: spacing.xs },
  cardBody: { fontFamily: fonts.body, color: colors.border },
});
