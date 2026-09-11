import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { uploadAndExtractDocument } from '@/lib/extraction';
import { Button } from '@/components/ui/Button';
import type { UploadedDocument } from '@/types/documents';

interface Props {
  onExtracted: (doc: UploadedDocument) => void;
}

type Status = 'idle' | 'uploading' | 'extracting' | 'done' | 'error';

export function DocumentUpload({ onExtracted }: Props) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<UploadedDocument | null>(null);

  const processAsset = async (params: { uri: string; mimeType: string; base64?: string }) => {
    if (!user) return;
    setErrorMessage(null);
    setStatus('uploading');
    try {
      const doc = await uploadAndExtractDocument({ userId: user.id, ...params });
      setStatus('done');
      setResult(doc);
      onExtracted(doc);
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

  return (
    <View style={styles.container}>
      {status === 'idle' || status === 'error' ? (
        <View style={styles.buttons}>
          <Button title="Take photo" onPress={handleTakePhoto} />
          <Button title="Choose from library" onPress={handleChooseFromLibrary} />
          <Button title="Choose PDF" onPress={handleChoosePdf} />
        </View>
      ) : null}

      {status === 'uploading' || status === 'extracting' ? (
        <Text style={styles.status}>Uploading & reading your document…</Text>
      ) : null}

      {status === 'error' && errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {status === 'done' && result ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Document saved</Text>
          <Text style={styles.previewRow}>Type: {result.extracted_data.document_type ?? '—'}</Text>
          <Text style={styles.previewRow}>Provider: {result.extracted_data.provider ?? '—'}</Text>
          <Text style={styles.previewRow}>Date: {result.extracted_data.date ?? '—'}</Text>
          <Text style={styles.previewRow}>
            Amount: {result.extracted_data.amount !== null ? `€${result.extracted_data.amount}` : '—'}
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
