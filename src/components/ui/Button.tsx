import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'accent';
}

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: Props) {
  const isInactive = loading || disabled;

  return (
    <Pressable
      style={[
        styles.button,
        variant === 'accent' ? styles.accent : styles.primary,
        disabled && !loading ? styles.disabled : null,
      ]}
      onPress={isInactive ? undefined : onPress}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  accent: {
    backgroundColor: colors.accent,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontFamily: fonts.body,
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
