import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { deleteMaintenance } from '@/lib/coverage';
import type { Maintenance } from '@/types/assets';

interface Props {
  records: Maintenance[];
  onDeleted: (maintenanceId: string) => void;
}

export function MaintenanceList({ records, onDeleted }: Props) {
  const handleDelete = (record: Maintenance) => {
    Alert.alert('Delete maintenance record?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMaintenance(record.id);
          onDeleted(record.id);
        },
      },
    ]);
  };

  if (records.length === 0) {
    return <Text style={styles.empty}>No maintenance recorded.</Text>;
  }

  return (
    <View style={styles.list}>
      {records.map((record) => (
        <View key={record.id} style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.date}>{record.date ?? 'No date'}</Text>
            {record.description ? <Text style={styles.description}>{record.description}</Text> : null}
            {record.cost !== null ? <Text style={styles.description}>€{record.cost}</Text> : null}
          </View>
          <Pressable onPress={() => handleDelete(record)}>
            <Text style={styles.deleteLink}>Delete</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  info: { gap: spacing.xs },
  date: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  description: { fontFamily: fonts.body, color: colors.border },
  deleteLink: { fontFamily: fonts.body, color: colors.critical, fontWeight: '600' },
  empty: { fontFamily: fonts.body, color: colors.border },
});
