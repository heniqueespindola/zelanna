import { useCallback, useState } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchBills, groupBills, type BillGroup } from '@/lib/bills';
import { BillGroupCard } from '@/components/bills/BillGroupCard';

export default function BillsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<BillGroup[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchBills(user.id).then((bills) => setGroups(groupBills(bills)));
    }, [user])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bills</Text>
      <Text style={styles.subtitle}>Track water, electricity, gas, internet, phone and insurance over time.</Text>

      {groups === null ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : groups.length === 0 ? (
        <Text style={styles.subtitle}>Upload an invoice and set its category to start building history.</Text>
      ) : (
        groups.map((group) => <BillGroupCard key={`${group.category}::${group.provider}`} group={group} />)
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
