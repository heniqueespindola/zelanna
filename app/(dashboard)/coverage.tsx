import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchAssets, fetchCoverageForAsset, fetchDocumentsWithoutAsset } from '@/lib/coverage';
import { CoverageCheckForm } from '@/components/coverage/CoverageCheckForm';
import { CoverageResult } from '@/components/coverage/CoverageResult';
import type { Asset } from '@/types/assets';
import type { CoverageRecord } from '@/types/coverage';
import type { UploadedDocument } from '@/types/documents';

export default function CoverageScreen() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [documentsWithoutAsset, setDocumentsWithoutAsset] = useState<UploadedDocument[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [records, setRecords] = useState<CoverageRecord[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      Promise.all([fetchAssets(user.id), fetchDocumentsWithoutAsset(user.id)]).then(
        ([loadedAssets, loadedDocuments]) => {
          setAssets(loadedAssets);
          setDocumentsWithoutAsset(loadedDocuments);
        }
      );
    }, [user])
  );

  useEffect(() => {
    if (!selectedAssetId) return;
    fetchCoverageForAsset(selectedAssetId).then(setRecords);
  }, [selectedAssetId]);

  const handleSelectAsset = (assetId: string) => {
    setRecords(null);
    setSelectedAssetId(assetId);
  };

  const handleAssetCreated = (asset: Asset, documentId: string) => {
    setAssets((prev) => [asset, ...(prev ?? [])]);
    setDocumentsWithoutAsset((prev) => prev.filter((d) => d.id !== documentId));
    setRecords(null);
    setSelectedAssetId(asset.id);
  };

  const selectedAsset = assets?.find((a) => a.id === selectedAssetId) ?? null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coverage Check</Text>
      <Text style={styles.subtitle}>
        Select an asset to see if it&apos;s covered by a warranty or insurance.
      </Text>

      {assets === null || !user ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : (
        <CoverageCheckForm
          userId={user.id}
          assets={assets}
          documentsWithoutAsset={documentsWithoutAsset}
          selectedAssetId={selectedAssetId}
          onSelectAsset={handleSelectAsset}
          onAssetCreated={handleAssetCreated}
        />
      )}

      {selectedAsset && records ? <CoverageResult asset={selectedAsset} records={records} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest, padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
});
