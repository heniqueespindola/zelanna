import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchDigitalAssets,
  fetchEstateDocuments,
  fetchEstateInstructions,
  fetchFinancialAssets,
  fetchTrustedPeople,
} from '@/lib/estate';

interface CardData {
  key: string;
  title: string;
  route: string;
  countLabel: string;
}

export default function EstateHubScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [hasInstructions, setHasInstructions] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      Promise.all([
        fetchDigitalAssets(user.id),
        fetchFinancialAssets(user.id),
        fetchEstateDocuments(user.id),
        fetchTrustedPeople(user.id),
        fetchEstateInstructions(user.id),
      ]).then(([digitalAssets, financialAssets, documents, trustedPeople, instructions]) => {
        setCounts({
          digital_assets: digitalAssets.length,
          financial_assets: financialAssets.length,
          important_documents: documents.length,
          trusted_people: trustedPeople.length,
        });
        setHasInstructions(!!instructions?.content.trim());
      });
    }, [user])
  );

  const cards: CardData[] = [
    { key: 'digital_assets', title: 'Digital Assets', route: '/estate/digital-assets', countLabel: `${counts?.digital_assets ?? 0} registered` },
    { key: 'financial_assets', title: 'Financial Assets', route: '/estate/financial-assets', countLabel: `${counts?.financial_assets ?? 0} registered` },
    { key: 'important_documents', title: 'Important Documents', route: '/estate/important-documents', countLabel: `${counts?.important_documents ?? 0} registered` },
    { key: 'trusted_people', title: 'Trusted People', route: '/estate/trusted-people', countLabel: `${counts?.trusted_people ?? 0} registered` },
    { key: 'emergency_pack', title: 'Emergency Pack', route: '/estate/emergency-pack', countLabel: 'Export & share' },
    { key: 'instructions', title: 'Instructions', route: '/estate/instructions', countLabel: hasInstructions ? 'Written' : 'Not written yet' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Digital Estate</Text>
      <Text style={styles.subtitle}>Make sure the people you trust can find what matters when you can&apos;t.</Text>

      <View style={{ gap: spacing.sm }}>
        {cards.map((card) => (
          <Pressable key={card.key} style={styles.card} onPress={() => router.push(card.route)}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardCount}>{card.countLabel}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  cardCount: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
});
