import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { uploadDocument, extractDocument } from '@/lib/extraction';
import { Button } from '@/components/ui/Button';
import { DocumentPreviewForm } from '@/components/documents/DocumentPreviewForm';
import type { ExtractionResult, UploadedDocument } from '@/types/documents';

interface Props {
  onExtracted: (doc: UploadedDocument) => void;
}

type Status = 'idle' | 'uploading' | 'extracting' | 'previewing' | 'done' | 'error';

export function DocumentUpload({ onExtracted }: Props) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [savedDoc, setSavedDoc] = useState<UploadedDocument | null>(null);

  const processAsset = async (params: { uri: string; mimeType: string; base64?: string }) => {
    if (!user) return;
    setErrorMessage(null);
    setStatus('uploading');
    try {
      const { documentPath } = await uploadDocument({ userId: user.id, ...params });
      setStatus('extracting');
      const result = await extractDocument({ documentPath, mimeType: params.mimeType });
      setExtraction(result);
      setStatus('previewing');
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({ base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    await processAsset({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', base64: asset.base64 ?? undefined });
  };

  const handleChooseFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    await processAsset({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', base64: asset.base64 ?? undefined });
  };

  const handleChoosePdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled) return;
    const asset = result.assets[0];
    await processAsset({ uri: asset.uri, mimeType: asset.mimeType ?? 'application/pdf' });
  };

  const handleSaved = (doc: UploadedDocument) => {
    setSavedDoc(doc);
    setStatus('done');
    onExtracted(doc);
  };

  const handleCancelled = () => {
    setExtraction(null);
    setStatus('idle');
  };

  return (
    <View style={styles.container}>
      {status === 'idle' || status === 'error' ? (
        <View style={styles.buttons}>
          <Button title="Take photo" onPress={handleTakePhoto} />
          <Button title="Choose from library" onPress={handleChooseFromLibrary} />
          <Button title="Choose PDF" onPress={handleChoosePdf} />
        </View>
      ) : null}

      {status === 'uploading' ? <Text style={styles.status}>Uploading your document…</Text> : null}

      {status === 'extracting' ? <Text style={styles.status}>Reading your document…</Text> : null}

      {status === 'error' && errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {status === 'previewing' && extraction && user ? (
        <DocumentPreviewForm
          userId={user.id}
          documentPath={extraction.documentPath}
          extracted={extraction.extracted}
          onSaved={handleSaved}
          onCancelled={handleCancelled}
        />
      ) : null}

      {status === 'done' && savedDoc ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Document saved</Text>
          <Text style={styles.previewRow}>Type: {savedDoc.document_type ?? '—'}</Text>
          <Text style={styles.previewRow}>Provider: {savedDoc.provider ?? '—'}</Text>
          <Text style={styles.previewRow}>Date: {savedDoc.date ?? '—'}</Text>
          <Text style={styles.previewRow}>
            Amount: {savedDoc.amount !== null ? `€${savedDoc.amount}` : '—'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  buttons: {
    gap: spacing.sm,
  },
  status: {
    fontFamily: fonts.body,
    color: colors.surfaceAlt,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.body,
    color: colors.critical,
    textAlign: 'center',
  },
  preview: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  previewTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.black,
    marginBottom: spacing.xs,
  },
  previewRow: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.black,
  },
});
