import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchGmailStatus } from '@/lib/gmailAuth';
import { fetchPendingGmailImportItems, markGmailImportItemReviewed, triggerGmailSync } from '@/lib/gmailImports';
import { DocumentPreviewForm } from '@/components/documents/DocumentPreviewForm';
import { Button } from '@/components/ui/Button';
import type { GmailImportItem } from '@/types/gmail';
import type { UploadedDocument } from '@/types/documents';

export function GmailImportQueue() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [items, setItems] = useState<GmailImportItem[]>([]);
  const [selected, setSelected] = useState<GmailImportItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setItems(await fetchPendingGmailImportItems(user.id));
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchGmailStatus(), fetchPendingGmailImportItems(user.id)])
      .then(([status, pendingItems]) => {
        setConnected(status.connected);
        setItems(pendingItems);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleSync = async () => {
    setSyncError(null);
    setSyncing(true);
    try {
      await triggerGmailSync();
      await load();
    } catch {
      setSyncError('Could not check Gmail for new bills. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaved = async (doc: UploadedDocument) => {
    if (!selected) return;
    await markGmailImportItemReviewed({ itemId: selected.id, status: 'imported', documentId: doc.id });
    setSelected(null);
    load();
  };

  const handleCancelled = async () => {
    if (!selected) return;
    // discardDocument(documentPath) já é chamado dentro do próprio DocumentPreviewForm.handleCancel
    await markGmailImportItemReviewed({ itemId: selected.id, status: 'skipped' });
    setSelected(null);
    load();
  };

  if (loading || !connected) return null;

  if (selected && user) {
    return (
      <DocumentPreviewForm
        userId={user.id}
        documentPath={selected.document_path!}
        extracted={selected.extracted_data!}
        onSaved={handleSaved}
        onCancelled={handleCancelled}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.syncRow}>
        <Text style={styles.title}>Gmail</Text>
        <Button title="Sync now" onPress={handleSync} loading={syncing} />
      </View>
      {syncError ? <Text style={styles.error}>{syncError}</Text> : null}
      {items.length > 0 ? (
        <>
          <Text style={styles.subtitle}>Found via Gmail ({items.length})</Text>
          {items.map((item) => (
            <Pressable key={item.id} style={styles.card} onPress={() => setSelected(item)}>
              <Text style={styles.cardText}>
                {item.extracted_data?.provider ?? 'Unknown provider'} —{' '}
                {item.extracted_data?.amount !== null && item.extracted_data?.amount !== undefined
                  ? `€${item.extracted_data.amount}`
                  : '—'}
              </Text>
              <Text style={styles.cardSubtext}>{item.extracted_data?.date ?? '—'}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.white,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.border,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.critical,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.black,
  },
  cardSubtext: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.black,
  },
});
