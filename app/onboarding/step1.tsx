import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { Button } from '@/components/ui/Button';

const GOAL_OPTIONS: { key: string; label: string }[] = [
  { key: 'protect', label: 'Protecting assets' },
  { key: 'expenses', label: 'Tracking expenses' },
  { key: 'estate', label: 'Preparing your digital estate' },
];

export default function OnboardingStep1() {
  const router = useRouter();
  const { setGoals } = useOnboarding();
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  const toggleGoal = (key: string) => {
    setSelectedGoals((current) =>
      current.includes(key) ? current.filter((goal) => goal !== key) : [...current, key]
    );
  };

  return (
    <View style={styles.container}>
      <OnboardingProgress step={1} />
      <Text style={styles.title}>What matters most to you?</Text>
      <Text style={styles.subtitle}>
        Protecting assets · Tracking expenses · Preparing your digital estate
      </Text>

      <View style={styles.chips}>
        {GOAL_OPTIONS.map((option) => {
          const selected = selectedGoals.includes(option.key);
          return (
            <Pressable
              key={option.key}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
              onPress={() => toggleGoal(option.key)}
            >
              <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Button
        title="Continue"
        disabled={selectedGoals.length === 0}
        onPress={() => {
          setGoals(selectedGoals);
          router.push('/onboarding/step2');
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
  chips: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipUnselected: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.black,
    textAlign: 'center',
  },
  chipTextSelected: {
    color: colors.white,
  },
});
