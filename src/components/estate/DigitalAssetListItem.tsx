import { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { deleteDigitalAsset } from '@/lib/estate';
import { DigitalAssetForm } from '@/components/estate/DigitalAssetForm';
import type { DigitalAsset } from '@/types/estate';

interface Props {
  asset: DigitalAsset;
  onUpdated: (asset: DigitalAsset) => void;
  onDeleted: (assetId: string) => void;
}

export function DigitalAssetListItem({ asset, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);

  const handleDelete = () => {
    Alert.alert('Delete digital asset?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDigitalAsset(asset.id);
          onDeleted(asset.id);
        },
      },
    ]);
  };

  if (editing) {
    return (
      <DigitalAssetForm
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
        {asset.location ? <Text style={styles.meta}>{asset.location}</Text> : null}
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
