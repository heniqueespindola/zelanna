import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { AssetSelector } from '@/components/coverage/AssetSelector';
import { CreateAssetFromDocumentForm } from '@/components/coverage/CreateAssetFromDocumentForm';
import type { Asset } from '@/types/assets';
import type { UploadedDocument } from '@/types/documents';

interface Props {
  userId: string;
  assets: Asset[];
  documentsWithoutAsset: UploadedDocument[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  onAssetCreated: (asset: Asset, documentId: string) => void;
}

export function CoverageCheckForm({
  userId,
  assets,
  documentsWithoutAsset,
  selectedAssetId,
  onSelectAsset,
  onAssetCreated,
}: Props) {
  const [creatingFromDocument, setCreatingFromDocument] = useState<UploadedDocument | null>(null);

  if (assets.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>You don&apos;t have any assets yet.</Text>
        {documentsWithoutAsset.length === 0 ? (
          <Text style={styles.text}>Upload a warranty or insurance document in Documents to get started.</Text>
        ) : (
          <View style={styles.container}>
            <Text style={styles.text}>Create an asset from one of your documents:</Text>
            {documentsWithoutAsset.map((doc) => (
              <Pressable
                key={doc.id}
                style={styles.documentRow}
                onPress={() => setCreatingFromDocument(doc)}
              >
                <Text style={styles.documentText}>
                  {doc.provider ?? doc.document_type ?? 'Untitled document'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {creatingFromDocument ? (
          <CreateAssetFromDocumentForm
            userId={userId}
            document={creatingFromDocument}
            onCreated={(asset) => {
              setCreatingFromDocument(null);
              onAssetCreated(asset, creatingFromDocument.id);
            }}
            onCancelled={() => setCreatingFromDocument(null)}
          />
        ) : null}
      </View>
    );
  }

  return <AssetSelector assets={assets} value={selectedAssetId} onChange={onSelectAsset} />;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  text: {
    fontFamily: fonts.body,
    color: colors.white,
  },
  documentRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  documentText: {
    fontFamily: fonts.body,
    color: colors.white,
  },
});
