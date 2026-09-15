import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import type { Asset } from '@/types/assets';

interface Props {
  assets: Asset[];
  value: string | null;
  onChange: (assetId: string) => void;
}

export function AssetSelector({ assets, value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Asset</Text>
      <View style={styles.chips}>
        {assets.map((asset) => {
          const selected = asset.id === value;
          return (
            <Pressable
              key={asset.id}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
              onPress={() => onChange(asset.id)}
            >
              <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                {asset.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipUnselected: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  chipText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.white,
  },
  chipTextSelected: {
    fontWeight: '700',
  },
});
