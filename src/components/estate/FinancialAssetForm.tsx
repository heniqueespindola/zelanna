import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createFinancialAsset, updateFinancialAsset } from '@/lib/estate';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FinancialAssetTypeSelector } from '@/components/estate/FinancialAssetTypeSelector';
import type { FinancialAsset, FinancialAssetType } from '@/types/estate';

interface Props {
  mode: 'create' | 'edit';
  userId: string;
  initialAsset?: FinancialAsset;
  onSaved: (asset: FinancialAsset) => void;
  onCancelled: () => void;
}

export function FinancialAssetForm({ mode, userId, initialAsset, onSaved, onCancelled }: Props) {
  const [name, setName] = useState(initialAsset?.name ?? '');
  const [type, setType] = useState<FinancialAssetType | null>(initialAsset?.type ?? null);
  const [institution, setInstitution] = useState(initialAsset?.institution ?? '');
  const [notes, setNotes] = useState(initialAsset?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      const params = {
        name: name.trim(),
        type,
        institution: institution.trim() || null,
        notes: notes.trim() || null,
      };
      const asset =
        mode === 'create'
          ? await createFinancialAsset({ userId, ...params })
          : await updateFinancialAsset((initialAsset as FinancialAsset).id, params);
      onSaved(asset);
    } catch {
      setSaving(false);
      setError('Could not save this financial asset. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'create' ? 'Add financial asset' : 'Edit financial asset'}</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Main current account" />
      <FinancialAssetTypeSelector value={type} onChange={setType} />
      <Input label="Institution" value={institution} onChangeText={setInstitution} placeholder="e.g. Millennium BCP" />
      <Input label="Notes" value={notes} onChangeText={setNotes} />
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
