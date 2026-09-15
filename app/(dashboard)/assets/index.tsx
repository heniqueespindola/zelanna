import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchAssets, fetchCoverageForUser } from '@/lib/coverage';
import { AssetForm } from '@/components/assets/AssetForm';
import { AssetListItem } from '@/components/assets/AssetListItem';
import { Button } from '@/components/ui/Button';
import type { Asset } from '@/types/assets';
import type { CoverageRecord } from '@/types/coverage';

export default function AssetsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageRecord[]>([]);
  const [showForm, setShowForm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      Promise.all([fetchAssets(user.id), fetchCoverageForUser()]).then(([loadedAssets, loadedCoverage]) => {
        setAssets(loadedAssets);
        setCoverage(loadedCoverage);
      });
    }, [user])
  );

  const handleCreated = (asset: Asset) => {
    setShowForm(false);
    router.push(`/assets/${asset.id}`);
  };

  const coverageForAsset = (assetId: string) => coverage.filter((c) => c.asset_id === assetId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Assets</Text>
      <Text style={styles.subtitle}>Everything you own, protect and maintain.</Text>

      {assets === null || !user ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : (
        <>
          {assets.length === 0 && !showForm ? (
            <Text style={styles.subtitle}>No assets yet.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {assets.map((asset) => (
                <AssetListItem key={asset.id} asset={asset} records={coverageForAsset(asset.id)} />
              ))}
            </View>
          )}

          {showForm ? (
            <AssetForm mode="create" userId={user.id} onSaved={handleCreated} onCancelled={() => setShowForm(false)} />
          ) : (
            <Button title="Add asset" variant="accent" onPress={() => setShowForm(true)} />
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
