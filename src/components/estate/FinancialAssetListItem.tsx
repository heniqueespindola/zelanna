import { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { deleteFinancialAsset } from '@/lib/estate';
import { FinancialAssetForm } from '@/components/estate/FinancialAssetForm';
import type { FinancialAsset } from '@/types/estate';

interface Props {
  asset: FinancialAsset;
  onUpdated: (asset: FinancialAsset) => void;
  onDeleted: (assetId: string) => void;
}

export function FinancialAssetListItem({ asset, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);

  const handleDelete = () => {
    Alert.alert('Delete financial asset?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFinancialAsset(asset.id);
          onDeleted(asset.id);
        },
      },
    ]);
  };

  if (editing) {
    return (
      <FinancialAssetForm
        mode="edit"
        userId={asset.user_id}
        initialAsset={asset}
        onSaved={(updated) => {
          onUpdated(updated);
          setEditing(false);
        }}
        onCancelled={() => setEditing(false)}
      />
    );
  }

  return (
    <Pressable style={styles.row} onPress={() => setEditing(true)}>
      <View style={styles.info}>
        <Text style={styles.name}>{asset.name}</Text>
        {asset.type ? <Text style={styles.meta}>{asset.type}</Text> : null}
        {asset.institution ? <Text style={styles.meta}>{asset.institution}</Text> : null}
      </View>
      <Pressable onPress={handleDelete}>
        <Text style={styles.deleteLink}>Delete</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  info: { gap: spacing.xs },
  name: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
  deleteLink: { fontFamily: fonts.body, color: colors.critical, fontWeight: '600' },
});
