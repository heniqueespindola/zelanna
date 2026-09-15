import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { daysUntil } from '@/lib/rulesEngine';
import { groupEventsByDate } from '@/lib/events';
import type { LifeCalendarEntry } from '@/lib/events';

interface Props {
  entries: LifeCalendarEntry[];
}

export function LifeCalendar({ entries }: Props) {
  const groups = useMemo(() => groupEventsByDate(entries), [entries]);

  if (groups.length === 0) {
    return <Text style={styles.empty}>Nothing due in the next 60 days.</Text>;
  }

  return (
    <View style={styles.list}>
      {groups.map((group) => (
        <View key={group.date} style={styles.group}>
          <Text style={styles.date}>{group.date}</Text>
          {group.entries.map((entry) => (
            <Text key={entry.event.id} style={styles.row}>
              {entry.source === 'contract'
                ? `${entry.contract.provider} — renews in ${daysUntil(entry.event.due_date as string)} days`
                : entry.source === 'asset_coverage'
                  ? `${entry.asset.name} — ${entry.coverageType} expires in ${daysUntil(entry.event.due_date as string)} days`
                  : `${entry.asset.name} — return window closes in ${daysUntil(entry.event.due_date as string)} days`}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.body, color: colors.border },
  list: { gap: spacing.sm },
  group: { gap: spacing.xs },
  date: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  row: { fontFamily: fonts.body, color: colors.border },
});
