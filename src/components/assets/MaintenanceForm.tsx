import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createMaintenance } from '@/lib/coverage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Maintenance } from '@/types/assets';

interface Props {
  assetId: string;
  onSaved: (maintenance: Maintenance) => void;
  onCancelled: () => void;
}

export function MaintenanceForm({ assetId, onSaved, onCancelled }: Props) {
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);

    const parsedCost = cost.trim() ? Number(cost) : null;
    if (cost.trim() && Number.isNaN(parsedCost)) {
      setError('Cost must be a number.');
      return;
    }

    setSaving(true);
    try {
      const maintenance = await createMaintenance({
        assetId,
        date: date.trim() || null,
        description: description.trim() || null,
        cost: parsedCost,
      });
      onSaved(maintenance);
    } catch {
      setSaving(false);
      setError('Could not save this maintenance record. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add maintenance</Text>
      <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Input label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Battery replacement" />
      <Input label="Cost" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="e.g. 89" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <Button title="Cancel" variant="primary" disabled={saving} onPress={onCancelled} />
        <Button title="Save" variant="accent" loading={saving} onPress={handleSave} />
      </View>
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
  error: {
    fontFamily: fonts.body,
    color: colors.critical,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
