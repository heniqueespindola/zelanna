import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createTrustedPerson, updateTrustedPerson } from '@/lib/estate';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { TrustedPerson } from '@/types/estate';

interface Props {
  mode: 'create' | 'edit';
  userId: string;
  initialPerson?: TrustedPerson;
  onSaved: (person: TrustedPerson) => void;
  onCancelled: () => void;
}

export function TrustedPersonForm({ mode, userId, initialPerson, onSaved, onCancelled }: Props) {
  const [name, setName] = useState(initialPerson?.name ?? '');
  const [relationship, setRelationship] = useState(initialPerson?.relationship ?? '');
  const [email, setEmail] = useState(initialPerson?.email ?? '');
  const [phone, setPhone] = useState(initialPerson?.phone ?? '');
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
        relationship: relationship.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      };
      const person =
        mode === 'create'
          ? await createTrustedPerson({ userId, ...params })
          : await updateTrustedPerson((initialPerson as TrustedPerson).id, params);
      onSaved(person);
    } catch {
      setSaving(false);
      setError('Could not save this trusted person. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'create' ? 'Add trusted person' : 'Edit trusted person'}</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Maria Silva" />
      <Input label="Relationship" value={relationship} onChangeText={setRelationship} placeholder="e.g. Spouse" />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
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
