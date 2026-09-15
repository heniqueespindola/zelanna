import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { daysUntil } from '@/lib/rulesEngine';
import { groupEventsByDate } from '@/lib/events';
import type { ContractRenewalEvent } from '@/lib/events';

interface Props {
  entries: ContractRenewalEvent[];
}

export function LifeCalendar({ entries }: Props) {
  const groups = useMemo(() => groupEventsByDate(entries), [entries]);

  if (groups.length === 0) {
    return <Text style={styles.empty}>No renewals in the next 60 days.</Text>;
  }

  return (
    <View style={styles.list}>
      {groups.map((group) => (
        <View key={group.date} style={styles.group}>
          <Text style={styles.date}>{group.date}</Text>
          {group.entries.map(({ event, contract }) => (
            <Text key={event.id} style={styles.row}>
              {contract.provider} — renews in {daysUntil(event.due_date as string)} days
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
