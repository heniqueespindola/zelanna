import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchFinancialAssets } from '@/lib/estate';
import { FinancialAssetForm } from '@/components/estate/FinancialAssetForm';
import { FinancialAssetListItem } from '@/components/estate/FinancialAssetListItem';
import { Button } from '@/components/ui/Button';
import type { FinancialAsset } from '@/types/estate';

export default function FinancialAssetsScreen() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<FinancialAsset[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchFinancialAssets(user.id).then(setAssets);
    }, [user])
  );

  const handleCreated = (asset: FinancialAsset) => {
    setAssets((prev) => [asset, ...(prev ?? [])]);
    setShowForm(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Financial Assets</Text>
      <Text style={styles.subtitle}>Banks, investments and other accounts your trusted people should know about.</Text>

      {assets === null || !user ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : (
        <>
          {assets.length === 0 && !showForm ? (
            <Text style={styles.subtitle}>No financial assets yet.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {assets.map((asset) => (
                <FinancialAssetListItem
                  key={asset.id}
                  asset={asset}
                  onUpdated={(updated) => setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))}
                  onDeleted={(id) => setAssets((prev) => (prev ?? []).filter((a) => a.id !== id))}
                />
              ))}
            </View>
          )}

          {showForm ? (
            <FinancialAssetForm mode="create" userId={user.id} onSaved={handleCreated} onCancelled={() => setShowForm(false)} />
          ) : (
            <Button title="Add financial asset" variant="accent" onPress={() => setShowForm(true)} />
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
