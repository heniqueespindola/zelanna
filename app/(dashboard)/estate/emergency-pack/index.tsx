import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchTrustedPeople } from '@/lib/estate';
import { countForSection, fetchEmergencyPackData, fetchPermittedPackSections } from '@/lib/emergencyPack';
import { buildEmergencyPackHtml, generateEmergencyPackPdf, shareEmergencyPackPdf } from '@/lib/emergencyPackPdf';
import { EmergencyPackTrustedPersonPicker } from '@/components/estate/EmergencyPackTrustedPersonPicker';
import { EmergencyPackSectionList } from '@/components/estate/EmergencyPackSectionList';
import { Button } from '@/components/ui/Button';
import type { TrustedPerson } from '@/types/estate';
import type { EmergencyPackData, EmergencyPackSection } from '@/types/emergencyPack';

const SECTION_LABEL: Record<EmergencyPackSection, string> = {
  assets: 'Assets',
  important_documents: 'Important Documents',
  insurance: 'Insurance',
  properties: 'Properties',
  digital_assets: 'Digital Assets',
  instructions: 'Instructions',
};

export default function EmergencyPackScreen() {
  const { trustedPersonId: trustedPersonIdParam } = useLocalSearchParams<{ trustedPersonId?: string }>();
  const { user } = useAuth();

  const [people, setPeople] = useState<TrustedPerson[]>([]);
  const [data, setData] = useState<EmergencyPackData | null>(null);
  const [selectedTrustedPersonId, setSelectedTrustedPersonId] = useState<string | null>(trustedPersonIdParam ?? null);
  const [permitted, setPermitted] = useState<EmergencyPackSection[] | null>(null);
  const [selectedSections, setSelectedSections] = useState<EmergencyPackSection[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(() => {
    if (!user) return;
    Promise.all([
      fetchTrustedPeople(user.id).then((p) => p.filter((x) => x.status === 'active')),
      fetchEmergencyPackData(user.id),
    ]).then(([loadedPeople, loadedData]) => {
      setPeople(loadedPeople);
      setData(loadedData);
      if (selectedTrustedPersonId) {
        fetchPermittedPackSections(selectedTrustedPersonId).then((allowed) => {
          setPermitted(allowed);
          setSelectedSections((prev) => prev.filter((s) => allowed.includes(s)));
        });
      }
    });
  }, [user, selectedTrustedPersonId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleSelectPerson = (id: string | null) => {
    setSelectedTrustedPersonId(id);
    if (id) {
      fetchPermittedPackSections(id).then((allowed) => {
        setPermitted(allowed);
        setSelectedSections((prev) => prev.filter((s) => allowed.includes(s)));
      });
    } else {
      setPermitted(null);
    }
  };

  const handleToggle = (section: EmergencyPackSection) => {
    if (permitted !== null && !permitted.includes(section)) return;
    setSelectedSections((prev) => (prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]));
  };

  const handleExport = async () => {
    if (!data || !user) return;
    setExporting(true);
    try {
      const ownerName = user.email ?? 'Zelanna user';
      const html = buildEmergencyPackHtml(data, selectedSections, ownerName);
      const uri = await generateEmergencyPackPdf(html);
      await shareEmergencyPackPdf(uri);
    } catch (error) {
      Alert.alert('Could not export', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  if (!data || !user) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Emergency Pack</Text>
      <Text style={styles.subtitle}>
        Export or share a structured pack of what matters — assets, coverage, documents and instructions.
      </Text>

      <EmergencyPackTrustedPersonPicker
        people={people}
        selectedId={selectedTrustedPersonId}
        onSelect={handleSelectPerson}
      />

      <EmergencyPackSectionList data={data} selected={selectedSections} permitted={permitted} onToggle={handleToggle} />

      <Button title="Regenerate" variant="primary" onPress={refresh} />
      <Button title={previewOpen ? 'Hide Preview' : 'Preview'} variant="primary" onPress={() => setPreviewOpen((v) => !v)} />

      {previewOpen ? (
        <View style={styles.preview}>
          {selectedSections.length === 0 ? (
            <Text style={styles.previewEmpty}>No sections selected yet.</Text>
          ) : (
            selectedSections.map((section) => (
              <Text key={section} style={styles.previewLine}>
                {SECTION_LABEL[section]} — {countForSection(data, section)} item(s)
              </Text>
            ))
          )}
        </View>
      ) : null}

      <Button
        title="Export PDF"
        variant="accent"
        onPress={handleExport}
        disabled={selectedSections.length === 0 || exporting}
        loading={exporting}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
  preview: { gap: spacing.xs },
  previewLine: { fontFamily: fonts.body, color: colors.white, fontSize: 14 },
  previewEmpty: { fontFamily: fonts.body, color: colors.border, fontSize: 14 },
});
