import { useCallback, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import {
  deleteTrustedPerson,
  fetchAccessLogForTrustedPerson,
  fetchPermissionsForTrustedPerson,
  fetchTrustedPersonById,
  logSimulatedAccess,
  updateTrustedPerson,
} from '@/lib/estate';
import { AccessLogList } from '@/components/estate/AccessLogList';
import { PermissionToggleList } from '@/components/estate/PermissionToggleList';
import { TrustedPersonForm } from '@/components/estate/TrustedPersonForm';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { EstateAccessLogEntry, EstateSection, TrustedPerson, TrustedPersonStatus } from '@/types/estate';

const STATUS_LABEL: Record<TrustedPersonStatus, string> = {
  active: 'Active',
  revoked: 'Revoked',
};

const STATUS_TONE: Record<TrustedPersonStatus, BadgeTone> = {
  active: 'success',
  revoked: 'critical',
};

const SECTION_LABEL: Record<EstateSection, string> = {
  digital_assets: 'Digital Assets',
  financial_assets: 'Financial Assets',
  important_documents: 'Important Documents',
  assets: 'Warranty Vault',
  coverage: 'Coverage',
  instructions: 'Instructions',
};

export default function TrustedPersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [person, setPerson] = useState<TrustedPerson | null>(null);
  const [granted, setGranted] = useState<EstateSection[]>([]);
  const [accessLog, setAccessLog] = useState<EstateAccessLogEntry[]>([]);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(() => {
    if (!id) return;
    Promise.all([fetchTrustedPersonById(id), fetchPermissionsForTrustedPerson(id), fetchAccessLogForTrustedPerson(id)]).then(
      ([loadedPerson, loadedPermissions, loadedLog]) => {
        setPerson(loadedPerson);
        setGranted(loadedPermissions.map((p) => p.section));
        setAccessLog(loadedLog);
      }
    );
  }, [id]);

  useFocusEffect(refresh);

  const handleToggleStatus = async () => {
    if (!person) return;
    const nextStatus: TrustedPersonStatus = person.status === 'active' ? 'revoked' : 'active';
    const updated = await updateTrustedPerson(person.id, { status: nextStatus });
    setPerson(updated);
  };

  const handleLogTestView = async (section: EstateSection) => {
    if (!person) return;
    await logSimulatedAccess(person.id, section);
    refresh();
  };

  const handleDelete = () => {
    if (!person) return;
    Alert.alert(
      'Delete trusted person?',
      'This also removes their permissions and audit log. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTrustedPerson(person.id);
            router.back();
          },
        },
      ]
    );
  };

  if (!person) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{person.name}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        {editing ? (
          <TrustedPersonForm
            mode="edit"
            userId={person.user_id}
            initialPerson={person}
            onSaved={(updated) => {
              setPerson(updated);
              setEditing(false);
            }}
            onCancelled={() => setEditing(false)}
          />
        ) : (
          <View style={styles.card}>
            <Badge label={STATUS_LABEL[person.status]} tone={STATUS_TONE[person.status]} />
            <Text style={styles.text}>Relationship: {person.relationship ?? '—'}</Text>
            <Text style={styles.text}>Email: {person.email ?? '—'}</Text>
            <Text style={styles.text}>Phone: {person.phone ?? '—'}</Text>
            <View style={styles.row}>
              <Pressable onPress={() => setEditing(true)}>
                <Text style={styles.link}>Edit</Text>
              </Pressable>
            </View>
            <Button
              title={person.status === 'active' ? 'Revoke access' : 'Reactivate'}
              variant="primary"
              onPress={handleToggleStatus}
            />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <PermissionToggleList trustedPersonId={person.id} granted={granted} onChanged={setGranted} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Access log</Text>
        <AccessLogList entries={accessLog} />
        {granted.length > 0 ? (
          <View style={styles.logButtons}>
            {granted.map((section) => (
              <Button
                key={section}
                title={`Log test view: ${SECTION_LABEL[section]}`}
                variant="primary"
                onPress={() => handleLogTestView(section)}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Pressable onPress={handleDelete}>
        <Text style={styles.deletePersonLink}>Delete trusted person</Text>
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
  logButtons: { gap: spacing.sm },
  deletePersonLink: {
    fontFamily: fonts.body,
    color: colors.critical,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
