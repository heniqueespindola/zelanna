import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { setDocumentEstateFlag } from '@/lib/estate';
import type { UploadedDocument } from '@/types/documents';

interface Props {
  documents: UploadedDocument[];
  onMarked: (doc: UploadedDocument) => void;
}

export function EstateDocumentPicker({ documents, onMarked }: Props) {
  const candidates = documents.filter((doc) => !doc.is_estate_document);

  const handlePress = async (doc: UploadedDocument) => {
    const updated = await setDocumentEstateFlag(doc.id, true);
    onMarked(updated);
  };

  if (candidates.length === 0) {
    return <Text style={styles.empty}>No other documents to mark.</Text>;
  }

  return (
    <View style={styles.list}>
      {candidates.map((doc) => (
        <Pressable key={doc.id} style={styles.row} onPress={() => handlePress(doc)}>
          <View style={styles.info}>
            <Text style={styles.provider}>{doc.provider ?? 'Untitled document'}</Text>
            <Text style={styles.meta}>
              {doc.document_type ?? '—'} · {doc.date ?? '—'}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  info: { gap: spacing.xs },
  provider: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
  empty: { fontFamily: fonts.body, color: colors.border },
});
