import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { createAsset, updateAsset } from '@/lib/coverage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AssetCategorySelector } from '@/components/coverage/AssetCategorySelector';
import type { Asset, AssetCategory } from '@/types/assets';

interface Props {
  mode: 'create' | 'edit';
  userId: string;
  initialAsset?: Asset;
  onSaved: (asset: Asset) => void;
  onCancelled: () => void;
}

export function AssetForm({ mode, userId, initialAsset, onSaved, onCancelled }: Props) {
  const [name, setName] = useState(initialAsset?.name ?? '');
  const [category, setCategory] = useState<AssetCategory | null>(initialAsset?.category ?? null);
  const [brand, setBrand] = useState(initialAsset?.brand ?? '');
  const [model, setModel] = useState(initialAsset?.model ?? '');
  const [serialNumber, setSerialNumber] = useState(initialAsset?.serial_number ?? '');
  const [seller, setSeller] = useState(initialAsset?.seller ?? '');
  const [purchaseDate, setPurchaseDate] = useState(initialAsset?.purchase_date ?? '');
  const [purchasePrice, setPurchasePrice] = useState(
    initialAsset?.purchase_price !== null && initialAsset?.purchase_price !== undefined
      ? String(initialAsset.purchase_price)
      : ''
  );
  const [returnDeadline, setReturnDeadline] = useState(initialAsset?.return_deadline ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Asset name is required.');
      return;
    }

    const parsedPrice = purchasePrice.trim() ? Number(purchasePrice) : null;
    if (purchasePrice.trim() && Number.isNaN(parsedPrice)) {
      setError('Purchase price must be a number.');
      return;
    }

    setSaving(true);
    try {
      const params = {
        name: name.trim(),
        category,
        brand: brand.trim() || null,
        model: model.trim() || null,
        serialNumber: serialNumber.trim() || null,
        purchaseDate: purchaseDate.trim() || null,
        purchasePrice: parsedPrice,
        seller: seller.trim() || null,
        returnDeadline: returnDeadline.trim() || null,
      };
      const asset =
        mode === 'create'
          ? await createAsset({ userId, ...params })
          : await updateAsset((initialAsset as Asset).id, params);
      onSaved(asset);
    } catch {
      setSaving(false);
      setError('Could not save this asset. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'create' ? 'Add asset' : 'Edit asset'}</Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. MacBook Pro" />
      <AssetCategorySelector value={category} onChange={setCategory} />
      <Input label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Apple" />
      <Input label="Model" value={model} onChangeText={setModel} placeholder="e.g. MacBook Pro 14" />
      <Input label="Serial number" value={serialNumber} onChangeText={setSerialNumber} />
      <Input label="Seller" value={seller} onChangeText={setSeller} placeholder="e.g. Fnac" />
      <Input
        label="Purchase date"
        value={purchaseDate}
        onChangeText={setPurchaseDate}
        placeholder="YYYY-MM-DD"
      />
      <Input
        label="Purchase price"
        value={purchasePrice}
        onChangeText={setPurchasePrice}
        keyboardType="decimal-pad"
        placeholder="e.g. 1999"
      />
      <Input
        label="Return deadline"
        value={returnDeadline}
        onChangeText={setReturnDeadline}
        placeholder="YYYY-MM-DD"
      />
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
