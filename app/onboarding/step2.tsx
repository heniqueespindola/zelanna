import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing } from '@/constants/theme';
import { useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { Button } from '@/components/ui/Button';

export default function OnboardingStep2() {
  const router = useRouter();
  const { uploadedDocument, setUploadedDocument } = useOnboarding();

  return (
    <View style={styles.container}>
      <OnboardingProgress step={2} />
      <Text style={styles.title}>Upload your first document</Text>
      <Text style={styles.subtitle}>
        A bill, a warranty or an insurance policy — Zelanna will read it for you.
      </Text>

      <DocumentUpload onExtracted={(doc) => setUploadedDocument(doc)} />

      <Button
        title="Continue"
        disabled={!uploadedDocument}
        onPress={() => router.push('/onboarding/step3')}
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
