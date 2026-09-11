import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { generateOnboardingInsight } from '@/lib/rulesEngine';
import { Button } from '@/components/ui/Button';

export default function OnboardingStep3() {
  const router = useRouter();
  const { uploadedDocument, goals, markCompleted } = useOnboarding();

  const insight = uploadedDocument ? generateOnboardingInsight(uploadedDocument.extracted_data) : null;
  const message = insight ? insight.message : 'Upload a document to see your first insight.';

  return (
    <View style={styles.container}>
      <OnboardingProgress step={3} />
      <Text style={styles.badge}>✨ Here's what we found</Text>
      <Text style={styles.title}>Your first insight</Text>
      <Text style={styles.subtitle}>{message}</Text>

      <Button
        title="Go to dashboard"
        onPress={async () => {
          await markCompleted(goals);
          router.replace('/(dashboard)');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgLight,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  badge: {
    fontFamily: fonts.body,
    color: colors.accent,
    textAlign: 'center',
    fontWeight: '600',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.black,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.surfaceAlt,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
