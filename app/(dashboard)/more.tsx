import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';

interface MoreItem {
  key: string;
  title: string;
  subtitle: string;
  route: string;
}

const ITEMS: MoreItem[] = [
  { key: 'assets', title: 'Assets', subtitle: 'Everything you own, protect and maintain.', route: '/assets' },
  { key: 'bills', title: 'Bills', subtitle: 'Utilities and recurring bills history.', route: '/bills' },
  { key: 'alerts', title: 'Alerts', subtitle: 'Renewals, price increases and anomalies.', route: '/alerts' },
  { key: 'estate', title: 'Digital Estate', subtitle: 'What the people you trust can find.', route: '/estate' },
];

export default function MoreScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>More</Text>

      <View style={{ gap: spacing.sm }}>
        {ITEMS.map((item) => (
          <Pressable key={item.key} style={styles.card} onPress={() => router.push(item.route)}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
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
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  cardSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
});
