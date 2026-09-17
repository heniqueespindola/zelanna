import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { AgentAction, AgentActionStatus, AgentActionType } from '@/types/agent';

const STATUS_LABEL: Record<AgentActionStatus, string> = {
  proposed: 'Proposed',
  approved: 'Approved',
  executed: 'Executed',
  rejected: 'Rejected',
  failed: 'Failed',
};

const STATUS_TONE: Record<AgentActionStatus, BadgeTone> = {
  proposed: 'info',
  approved: 'warning',
  executed: 'success',
  rejected: 'critical',
  failed: 'critical',
};

const ACTION_TYPE_LABEL: Record<AgentActionType, string> = {
  cancel: 'Cancel',
  renegotiate: 'Renegotiate',
};

interface Props {
  actions: AgentAction[];
}

export function AgentActionHistory({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>History</Text>
      {actions.map((action) => (
        <View key={action.id} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.actionType}>{ACTION_TYPE_LABEL[action.action_type]}</Text>
            <Badge label={STATUS_LABEL[action.status]} tone={STATUS_TONE[action.status]} />
          </View>
          {(action.executed_at ?? action.approved_at) && (
            <Text style={styles.date}>{action.executed_at ?? action.approved_at}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  row: { gap: spacing.xs },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionType: { fontFamily: fonts.body, fontWeight: '600', color: colors.white },
  date: { fontFamily: fonts.body, fontSize: 12, color: colors.border },
});
