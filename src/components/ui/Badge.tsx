import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

export type BadgeTone = 'success' | 'warning' | 'critical' | 'info';

interface Props {
  label: string;
  tone: BadgeTone;
}

const TONE_COLOR: Record<BadgeTone, string> = {
  success: colors.success,
  warning: colors.warning,
  critical: colors.critical,
  info: colors.info,
};

export function Badge({ label, tone }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: TONE_COLOR[tone] }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});
