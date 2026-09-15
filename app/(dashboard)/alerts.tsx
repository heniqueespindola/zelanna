import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchAllInsights,
  generateCoverageGapInsights,
  generateCoverageExpiringInsights,
  generateReturnDeadlineInsights,
  filterInsightsByBucket,
  resolveInsight,
} from '@/lib/insights';
import { fetchLifeCalendarEvents } from '@/lib/events';
import { AlertsFilter } from '@/components/dashboard/AlertsFilter';
import { LifeCalendar } from '@/components/dashboard/LifeCalendar';
import { InsightCard } from '@/components/dashboard/InsightCard';
import type { Insight, AlertsFilter as AlertsFilterValue } from '@/types/insights';
import type { LifeCalendarEntry } from '@/lib/events';

export default function AlertsScreen() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<LifeCalendarEntry[] | null>(null);
  const [filter, setFilter] = useState<AlertsFilterValue>('all');
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    await Promise.all([
      generateCoverageGapInsights(user.id),
      generateCoverageExpiringInsights(user.id),
      generateReturnDeadlineInsights(user.id),
    ]);
    const [loadedInsights, loadedEvents] = await Promise.all([
      fetchAllInsights(user.id, { includeResolved: showResolved }),
      fetchLifeCalendarEvents(user.id),
    ]);
    setInsights(loadedInsights);
    setCalendarEntries(loadedEvents);
  }, [user, showResolved]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleResolve = async (insightId: string) => {
    await resolveInsight(insightId);
    setInsights((prev) => (prev ? prev.filter((i) => i.id !== insightId) : prev));
  };

  const filteredInsights = useMemo(
    () => (insights ? filterInsightsByBucket(insights, filter) : []),
    [insights, filter]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.subtitle}>What needs your attention, and what&apos;s coming up.</Text>

      <AlertsFilter value={filter} onChange={setFilter} />

      {insights === null ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : filteredInsights.length === 0 ? (
        <Text style={styles.subtitle}>Nothing here right now.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {filteredInsights.map((insight) => (
            <View key={insight.id} style={styles.insightRow}>
              <InsightCard insight={insight} />
              <Pressable onPress={() => handleResolve(insight.id)}>
                <Text style={styles.resolveLink}>Resolve</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={() => setShowResolved((prev) => !prev)}>
        <Text style={styles.resolveLink}>{showResolved ? 'Hide resolved' : 'Show resolved'}</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Next 60 days</Text>
        {calendarEntries === null ? (
          <Text style={styles.subtitle}>Loading…</Text>
        ) : (
          <LifeCalendar entries={calendarEntries} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
  insightRow: { gap: spacing.xs },
  resolveLink: { fontFamily: fonts.body, color: colors.accent, fontWeight: '600' },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
});
