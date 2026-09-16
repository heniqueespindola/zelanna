import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchAllDocuments, fetchEstateDocuments, setDocumentEstateFlag } from '@/lib/estate';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { EstateDocumentPicker } from '@/components/estate/EstateDocumentPicker';
import type { UploadedDocument } from '@/types/documents';

export default function ImportantDocumentsScreen() {
  const { user } = useAuth();
  const [estateDocuments, setEstateDocuments] = useState<UploadedDocument[] | null>(null);
  const [allDocuments, setAllDocuments] = useState<UploadedDocument[]>([]);

  const refresh = useCallback(() => {
    if (!user) return;
    Promise.all([fetchEstateDocuments(user.id), fetchAllDocuments(user.id)]).then(([estate, all]) => {
      setEstateDocuments(estate);
      setAllDocuments(all);
    });
  }, [user]);

  useFocusEffect(refresh);

  const handleUnmark = async (doc: UploadedDocument) => {
    await setDocumentEstateFlag(doc.id, false);
    refresh();
  };

  const handleMarked = () => {
    refresh();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Important Documents</Text>
      <Text style={styles.subtitle}>Wills, certificates and any other document your trusted people may need.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Marked as important</Text>
        {estateDocuments === null || !user ? (
          <Text style={styles.subtitle}>Loading…</Text>
        ) : estateDocuments.length === 0 ? (
          <Text style={styles.subtitle}>No documents marked as important yet.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {estateDocuments.map((doc) => (
              <View key={doc.id} style={styles.row}>
                <View style={styles.info}>
                  <Text style={styles.provider}>{doc.provider ?? 'Untitled document'}</Text>
                  <Text style={styles.meta}>
                    {doc.document_type ?? '—'} · {doc.date ?? '—'}
                  </Text>
                </View>
                <Pressable onPress={() => handleUnmark(doc)}>
                  <Text style={styles.unmarkLink}>Unmark</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add</Text>
        {user ? (
          <DocumentUpload
            onExtracted={(doc) => {
              setDocumentEstateFlag(doc.id, true).then(refresh);
            }}
          />
        ) : null}
        <EstateDocumentPicker documents={allDocuments} onMarked={handleMarked} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  info: { gap: spacing.xs },
  provider: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
  unmarkLink: { fontFamily: fonts.body, color: colors.accent, fontWeight: '600' },
});
