import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createCoverage, updateCoverage } from '@/lib/coverage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CoverageTypeSelector } from '@/components/coverage/CoverageTypeSelector';
import type { CoverageRecord, CoverageType } from '@/types/coverage';

interface Props {
  mode: 'create' | 'edit';
  assetId: string;
  initialCoverage?: CoverageRecord;
  onSaved: (coverage: CoverageRecord) => void;
  onCancelled: () => void;
}

export function CoverageForm({ mode, assetId, initialCoverage, onSaved, onCancelled }: Props) {
  const [type, setType] = useState<CoverageType>(initialCoverage?.type ?? 'warranty');
  const [provider, setProvider] = useState(initialCoverage?.provider ?? '');
  const [startDate, setStartDate] = useState(initialCoverage?.start_date ?? '');
  const [endDate, setEndDate] = useState(initialCoverage?.end_date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const coverage =
        mode === 'create'
          ? await createCoverage({
              assetId,
              type,
              provider: provider.trim() || null,
              startDate: startDate.trim() || null,
              endDate: endDate.trim() || null,
            })
          : await updateCoverage((initialCoverage as CoverageRecord).id, {
              type,
              provider: provider.trim() || null,
              start_date: startDate.trim() || null,
              end_date: endDate.trim() || null,
            });
      onSaved(coverage);
    } catch {
      setSaving(false);
      setError('Could not save this coverage record. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'create' ? 'Add coverage' : 'Edit coverage'}</Text>
      <CoverageTypeSelector value={type} onChange={setType} />
      <Input label="Provider" value={provider} onChangeText={setProvider} placeholder="e.g. AppleCare" />
      <Input label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
      <Input label="End date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
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
