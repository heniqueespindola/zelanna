import { View, Text, TextInput, StyleSheet, type TextInputProps, type KeyboardTypeOptions } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  placeholder?: string;
}

export function Input({
  label,
  value,
  onChangeText,
  error,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  placeholder,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[‐-―]/g, '-'))}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor={colors.neutralMid}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.white,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.white,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputError: {
    borderColor: colors.critical,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.critical,
  },
});
