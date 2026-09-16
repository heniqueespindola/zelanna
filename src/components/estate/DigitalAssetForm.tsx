import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createDigitalAsset, updateDigitalAsset } from '@/lib/estate';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { DigitalAssetTypeSelector } from '@/components/estate/DigitalAssetTypeSelector';
import type { DigitalAsset, DigitalAssetType } from '@/types/estate';

interface Props {
  mode: 'create' | 'edit';
  userId: string;
  initialAsset?: DigitalAsset;
  onSaved: (asset: DigitalAsset) => void;
  onCancelled: () => void;
}

export function DigitalAssetForm({ mode, userId, initialAsset, onSaved, onCancelled }: Props) {
  const [name, setName] = useState(initialAsset?.name ?? '');
  const [type, setType] = useState<DigitalAssetType | null>(initialAsset?.type ?? null);
  const [location, setLocation] = useState(initialAsset?.location ?? '');
  const [credentialsLocation, setCredentialsLocation] = useState(initialAsset?.credentials_location ?? '');
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
        location: location.trim() || null,
        credentialsLocation: credentialsLocation.trim() || null,
        notes: notes.trim() || null,
      };
      const asset =
        mode === 'create'
          ? await createDigitalAsset({ userId, ...params })
          : await updateDigitalAsset((initialAsset as DigitalAsset).id, {
              name: params.name,
              type: params.type,
              location: params.location,
              credentials_location: params.credentialsLocation,
              notes: params.notes,
            });
      onSaved(asset);
    } catch {
      setSaving(false);
      setError('Could not save this digital asset. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'create' ? 'Add digital asset' : 'Edit digital asset'}</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. zelanna.com" />
      <DigitalAssetTypeSelector value={type} onChange={setType} />
      <Input label="Location" value={location} onChangeText={setLocation} placeholder="e.g. GoDaddy" />
      <Input
        label="Credentials location"
        value={credentialsLocation}
        onChangeText={setCredentialsLocation}
        placeholder="e.g. stored in 1Password"
      />
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
