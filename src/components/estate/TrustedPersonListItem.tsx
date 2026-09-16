import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { TrustedPerson, TrustedPersonStatus } from '@/types/estate';

interface Props {
  person: TrustedPerson;
}

const STATUS_LABEL: Record<TrustedPersonStatus, string> = {
  active: 'Active',
  revoked: 'Revoked',
};

const STATUS_TONE: Record<TrustedPersonStatus, BadgeTone> = {
  active: 'success',
  revoked: 'critical',
};

export function TrustedPersonListItem({ person }: Props) {
  const router = useRouter();

  return (
    <Pressable style={styles.row} onPress={() => router.push(`/estate/trusted-people/${person.id}`)}>
      <View style={styles.info}>
        <Text style={styles.name}>{person.name}</Text>
        {person.relationship ? <Text style={styles.meta}>{person.relationship}</Text> : null}
      </View>
      <Badge label={STATUS_LABEL[person.status]} tone={STATUS_TONE[person.status]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  info: { gap: spacing.xs },
  name: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.border },
});
