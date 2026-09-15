import { useCallback, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { getCoverageStatus } from '@/lib/rulesEngine';
import {
  deleteAsset,
  deleteCoverage,
  fetchAssetById,
  fetchClaimsForAsset,
  fetchCoverageForAsset,
  fetchDocumentForAsset,
  fetchMaintenanceForAsset,
} from '@/lib/coverage';
import { AssetForm } from '@/components/assets/AssetForm';
import { CoverageForm } from '@/components/assets/CoverageForm';
import { MaintenanceForm } from '@/components/assets/MaintenanceForm';
import { MaintenanceList } from '@/components/assets/MaintenanceList';
import { ClaimForm } from '@/components/assets/ClaimForm';
import { ClaimList } from '@/components/assets/ClaimList';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Asset, Claim, Maintenance } from '@/types/assets';
import type { CoverageRecord } from '@/types/coverage';
import type { UploadedDocument } from '@/types/documents';

const STATUS_TONE: Record<'active' | 'expiring_soon' | 'expired', BadgeTone> = {
  active: 'success',
  expiring_soon: 'warning',
  expired: 'critical',
};

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [coverageRecords, setCoverageRecords] = useState<CoverageRecord[]>([]);
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);

  const [editingAsset, setEditingAsset] = useState(false);
  const [showAddCoverage, setShowAddCoverage] = useState(false);
  const [editingCoverage, setEditingCoverage] = useState<CoverageRecord | null>(null);
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [showAddClaim, setShowAddClaim] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      Promise.all([
        fetchAssetById(id),
        fetchCoverageForAsset(id),
        fetchDocumentForAsset(id),
        fetchMaintenanceForAsset(id),
        fetchClaimsForAsset(id),
      ]).then(([loadedAsset, loadedCoverage, loadedDocument, loadedMaintenance, loadedClaims]) => {
        setAsset(loadedAsset);
        setCoverageRecords(loadedCoverage);
        setDocument(loadedDocument);
        setMaintenance(loadedMaintenance);
        setClaims(loadedClaims);
      });
    }, [id])
  );

  const handleDeleteAsset = () => {
    if (!asset) return;
    Alert.alert(
      'Delete asset?',
      'This also removes its coverage, maintenance and claims. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAsset(asset.id);
            router.back();
          },
        },
      ]
    );
  };

  const handleDeleteCoverage = (coverage: CoverageRecord) => {
    Alert.alert('Delete coverage record?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCoverage(coverage.id);
          setCoverageRecords((prev) => prev.filter((c) => c.id !== coverage.id));
        },
      },
    ]);
  };

  if (!asset) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{asset.name}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Purchase</Text>
        {editingAsset ? (
          <AssetForm
            mode="edit"
            userId={asset.user_id}
            initialAsset={asset}
            onSaved={(updated) => {
              setAsset(updated);
              setEditingAsset(false);
            }}
            onCancelled={() => setEditingAsset(false)}
          />
        ) : (
          <View style={styles.card}>
            <Text style={styles.text}>Brand: {asset.brand ?? '—'}</Text>
            <Text style={styles.text}>Model: {asset.model ?? '—'}</Text>
            <Text style={styles.text}>Serial number: {asset.serial_number ?? '—'}</Text>
            <Text style={styles.text}>Purchase date: {asset.purchase_date ?? '—'}</Text>
            <Text style={styles.text}>Purchase price: {asset.purchase_price !== null ? `€${asset.purchase_price}` : '—'}</Text>
            <Text style={styles.text}>Seller: {asset.seller ?? '—'}</Text>
            <Pressable onPress={() => setEditingAsset(true)}>
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invoice</Text>
        <View style={styles.card}>
          {document ? (
            <>
              <Text style={styles.text}>Provider: {document.provider ?? '—'}</Text>
              <Text style={styles.text}>Date: {document.date ?? '—'}</Text>
              <Text style={styles.text}>Amount: {document.amount !== null ? `€${document.amount}` : '—'}</Text>
            </>
          ) : (
            <Text style={styles.text}>No invoice linked.</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coverage</Text>
        <View style={{ gap: spacing.sm }}>
          {coverageRecords.map((coverage) =>
            editingCoverage?.id === coverage.id ? (
              <CoverageForm
                key={coverage.id}
                mode="edit"
                assetId={asset.id}
                initialCoverage={coverage}
                onSaved={(updated) => {
                  setCoverageRecords((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                  setEditingCoverage(null);
                }}
                onCancelled={() => setEditingCoverage(null)}
              />
            ) : (
              <View key={coverage.id} style={styles.card}>
                <Badge
                  label={coverage.type ?? 'coverage'}
                  tone={STATUS_TONE[getCoverageStatus(coverage.end_date)]}
                />
                <Text style={styles.text}>Provider: {coverage.provider ?? '—'}</Text>
                <Text style={styles.text}>
                  {coverage.start_date ?? '—'} → {coverage.end_date ?? '—'}
                </Text>
                <View style={styles.row}>
                  <Pressable onPress={() => setEditingCoverage(coverage)}>
                    <Text style={styles.link}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDeleteCoverage(coverage)}>
                    <Text style={styles.deleteLink}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            )
          )}

          {asset.return_deadline ? (
            <View style={styles.card}>
              <Badge label="Return deadline" tone={STATUS_TONE[getCoverageStatus(asset.return_deadline)]} />
              <Text style={styles.text}>Return by {asset.return_deadline}</Text>
            </View>
          ) : null}

          {showAddCoverage ? (
            <CoverageForm
              mode="create"
              assetId={asset.id}
              onSaved={(created) => {
                setCoverageRecords((prev) => [...prev, created]);
                setShowAddCoverage(false);
              }}
              onCancelled={() => setShowAddCoverage(false)}
            />
          ) : (
            <Button title="Add coverage" variant="accent" onPress={() => setShowAddCoverage(true)} />
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Maintenance</Text>
        <MaintenanceList
          records={maintenance}
          onDeleted={(maintenanceId) => setMaintenance((prev) => prev.filter((m) => m.id !== maintenanceId))}
        />
        {showAddMaintenance ? (
          <MaintenanceForm
            assetId={asset.id}
            onSaved={(created) => {
              setMaintenance((prev) => [created, ...prev]);
              setShowAddMaintenance(false);
            }}
            onCancelled={() => setShowAddMaintenance(false)}
          />
        ) : (
          <Button title="Add maintenance" variant="accent" onPress={() => setShowAddMaintenance(true)} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Claims</Text>
        <ClaimList claims={claims} onDeleted={(claimId) => setClaims((prev) => prev.filter((c) => c.id !== claimId))} />
        {showAddClaim ? (
          <ClaimForm
            assetId={asset.id}
            coverageRecords={coverageRecords}
            onSaved={(created) => {
              setClaims((prev) => [created, ...prev]);
              setShowAddClaim(false);
            }}
            onCancelled={() => setShowAddClaim(false)}
          />
        ) : (
          <Button title="Add claim" variant="accent" onPress={() => setShowAddClaim(true)} />
        )}
      </View>

      <Pressable onPress={handleDeleteAsset}>
        <Text style={styles.deleteAssetLink}>Delete asset</Text>
      </Pressable>
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
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  text: { fontFamily: fonts.body, color: colors.white },
  row: { flexDirection: 'row', gap: spacing.md },
  link: { fontFamily: fonts.body, color: colors.accent, fontWeight: '600' },
  deleteLink: { fontFamily: fonts.body, color: colors.critical, fontWeight: '600' },
  deleteAssetLink: {
    fontFamily: fonts.body,
    color: colors.critical,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
