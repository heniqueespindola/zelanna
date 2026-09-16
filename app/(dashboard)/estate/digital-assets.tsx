import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchDigitalAssets } from '@/lib/estate';
import { DigitalAssetForm } from '@/components/estate/DigitalAssetForm';
import { DigitalAssetListItem } from '@/components/estate/DigitalAssetListItem';
import { Button } from '@/components/ui/Button';
import type { DigitalAsset } from '@/types/estate';

export default function DigitalAssetsScreen() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<DigitalAsset[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchDigitalAssets(user.id).then(setAssets);
    }, [user])
  );

  const handleCreated = (asset: DigitalAsset) => {
    setAssets((prev) => [asset, ...(prev ?? [])]);
    setShowForm(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Digital Assets</Text>
      <Text style={styles.subtitle}>Domains, accounts and online businesses — never the credentials themselves.</Text>

      {assets === null || !user ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : (
        <>
          {assets.length === 0 && !showForm ? (
            <Text style={styles.subtitle}>No digital assets yet.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {assets.map((asset) => (
                <DigitalAssetListItem
                  key={asset.id}
                  asset={asset}
                  onUpdated={(updated) => setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))}
                  onDeleted={(id) => setAssets((prev) => (prev ?? []).filter((a) => a.id !== id))}
                />
              ))}
            </View>
          )}

          {showForm ? (
            <DigitalAssetForm mode="create" userId={user.id} onSaved={handleCreated} onCancelled={() => setShowForm(false)} />
          ) : (
            <Button title="Add digital asset" variant="accent" onPress={() => setShowForm(true)} />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
