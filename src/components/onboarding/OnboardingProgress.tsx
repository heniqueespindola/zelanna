import { Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';

interface Props {
  step: 1 | 2 | 3;
}

export function OnboardingProgress({ step }: Props) {
  return <Text style={styles.step}>{step} / 3</Text>;
}

const styles = StyleSheet.create({
  step: {
    fontFamily: fonts.body,
    color: colors.surfaceAlt,
    textAlign: 'center',
  },
});
