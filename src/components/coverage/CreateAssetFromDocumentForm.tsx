import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createAssetFromDocument, mapDocumentTypeToCoverageType } from '@/lib/coverage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AssetCategorySelector } from '@/components/coverage/AssetCategorySelector';
import { CoverageTypeSelector } from '@/components/coverage/CoverageTypeSelector';
import type { Asset, AssetCategory } from '@/types/assets';
import type { CoverageType } from '@/types/coverage';
import type { UploadedDocument } from '@/types/documents';

interface Props {
  userId: string;
  document: UploadedDocument;
  onCreated: (asset: Asset) => void;
  onCancelled: () => void;
}

export function CreateAssetFromDocumentForm({ userId, document, onCreated, onCancelled }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory | null>(null);
  const [coverageType, setCoverageType] = useState<CoverageType>(
    mapDocumentTypeToCoverageType(document.document_type) ?? 'warranty'
  );
  const [provider, setProvider] = useState(document.provider ?? '');
  const [startDate, setStartDate] = useState(document.date ?? '');
  const [endDate, setEndDate] = useState(document.expiry_date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Asset name is required.');
      return;
    }

    setSaving(true);
    try {
      const { asset } = await createAssetFromDocument({
        userId,
        documentId: document.id,
        name: name.trim(),
        category,
        coverageType,
        provider: provider.trim() || null,
        startDate: startDate.trim() || null,
        endDate: endDate.trim() || null,
        purchaseAmount: document.amount,
      });
      onCreated(asset);
    } catch {
      setSaving(false);
      setError('Could not create this asset. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Create asset from this document</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. MacBook Pro" />
      <AssetCategorySelector value={category} onChange={setCategory} />
      <CoverageTypeSelector value={coverageType} onChange={setCoverageType} />
      <Input label="Provider" value={provider} onChangeText={setProvider} placeholder="e.g. AppleCare" />
      <Input label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
      <Input label="End date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <Button title="Cancel" variant="primary" disabled={saving} onPress={onCancelled} />
        <Button title="Confirm" variant="accent" loading={saving} onPress={handleConfirm} />
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
