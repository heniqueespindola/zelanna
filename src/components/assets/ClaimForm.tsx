import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createClaim } from '@/lib/coverage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ChipRow } from '@/components/ui/ChipRow';
import type { Claim, ClaimStatus } from '@/types/assets';
import type { CoverageRecord } from '@/types/coverage';

interface Props {
  assetId: string;
  coverageRecords: CoverageRecord[];
  onSaved: (claim: Claim) => void;
  onCancelled: () => void;
}

const STATUS_OPTIONS: { value: ClaimStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'resolved', label: 'Resolved' },
];

export function ClaimForm({ assetId, coverageRecords, onSaved, onCancelled }: Props) {
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ClaimStatus>('open');
  const [coverageId, setCoverageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const coverageOptions: { value: string | null; label: string }[] = [
    { value: null, label: 'None' },
    ...coverageRecords.map((c) => ({ value: c.id, label: `${c.type ?? 'coverage'} — ${c.provider ?? 'Unknown'}` })),
  ];

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const claim = await createClaim({
        assetId,
        coverageId,
        date: date.trim() || null,
        description: description.trim() || null,
        status,
      });
      onSaved(claim);
    } catch {
      setSaving(false);
      setError('Could not save this claim. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add claim</Text>
      <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Input label="Description" value={description} onChangeText={setDescription} placeholder="What happened?" />
      <View style={styles.field}>
        <Text style={styles.label}>Status</Text>
        <ChipRow options={STATUS_OPTIONS} value={status} onChange={setStatus} />
      </View>
      {coverageRecords.length > 0 ? (
        <View style={styles.field}>
          <Text style={styles.label}>Coverage</Text>
          <ChipRow options={coverageOptions} value={coverageId} onChange={setCoverageId} />
        </View>
      ) : null}
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
  field: { gap: spacing.xs },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.white },
  error: {
    fontFamily: fonts.body,
    color: colors.critical,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
