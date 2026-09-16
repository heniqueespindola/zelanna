import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchTrustedPeople } from '@/lib/estate';
import { TrustedPersonForm } from '@/components/estate/TrustedPersonForm';
import { TrustedPersonListItem } from '@/components/estate/TrustedPersonListItem';
import { Button } from '@/components/ui/Button';
import type { TrustedPerson } from '@/types/estate';

export default function TrustedPeopleScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [people, setPeople] = useState<TrustedPerson[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchTrustedPeople(user.id).then(setPeople);
    }, [user])
  );

  const handleCreated = (person: TrustedPerson) => {
    setShowForm(false);
    router.push(`/estate/trusted-people/${person.id}`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trusted People</Text>
      <Text style={styles.subtitle}>People you can grant access to parts of your Digital Estate.</Text>

      {people === null || !user ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : (
        <>
          {people.length === 0 && !showForm ? (
            <Text style={styles.subtitle}>No trusted people yet.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {people.map((person) => (
                <TrustedPersonListItem key={person.id} person={person} />
              ))}
            </View>
          )}

          {showForm ? (
            <TrustedPersonForm mode="create" userId={user.id} onSaved={handleCreated} onCancelled={() => setShowForm(false)} />
          ) : (
            <Button title="Add trusted person" variant="accent" onPress={() => setShowForm(true)} />
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
