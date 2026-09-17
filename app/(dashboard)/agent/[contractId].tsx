import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchContractById } from '@/lib/contracts';
import {
  approveAgentAction,
  draftAction,
  fetchAgentActionsForContract,
  findAlternativesForAction,
  markAgentActionExecuted,
  proposeAgentAction,
  rejectAgentAction,
} from '@/lib/agent';
import { AlternativesList } from '@/components/agent/AlternativesList';
import { DraftPreview } from '@/components/agent/DraftPreview';
import { AgentActionHistory } from '@/components/agent/AgentActionHistory';
import { Button } from '@/components/ui/Button';
import { ChipRow } from '@/components/ui/ChipRow';
import type { AgentAction, AgentActionType } from '@/types/agent';
import type { Contract } from '@/types/contracts';

const ACTION_TYPE_OPTIONS: { value: AgentActionType; label: string }[] = [
  { value: 'renegotiate', label: 'Renegotiate' },
  { value: 'cancel', label: 'Cancel' },
];

const ACTION_TYPE_NOUN: Record<AgentActionType, string> = {
  cancel: 'cancellation',
  renegotiate: 'renegotiation',
};

export default function AgentContractDetailScreen() {
  const { contractId } = useLocalSearchParams<{ contractId: string }>();
  const { user } = useAuth();

  const [contract, setContract] = useState<Contract | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [selectedActionType, setSelectedActionType] = useState<AgentActionType>('renegotiate');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!contractId) return;
    const [loadedContract, loadedActions] = await Promise.all([
      fetchContractById(contractId),
      fetchAgentActionsForContract(contractId),
    ]);
    setContract(loadedContract);
    setActions(loadedActions);
  }, [contractId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const activeAction = useMemo(
    () => actions.find((a) => a.status === 'proposed' || a.status === 'approved') ?? null,
    [actions]
  );

  const handleFindAlternatives = async () => {
    if (!contract || !user) return;
    setBusy(true);
    try {
      const action = activeAction ?? (await proposeAgentAction({ userId: user.id, contractId: contract.id, actionType: selectedActionType }));
      await findAlternativesForAction(action.id, contract);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!contract || !activeAction) return;
    setBusy(true);
    try {
      await draftAction(activeAction.id, contract, selectedActionType);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!activeAction?.draft_content) return;
    await Clipboard.setStringAsync(activeAction.draft_content);
  };

  const handleApprove = () => {
    if (!activeAction || !contract) return;
    Alert.alert(
      'Approve this action?',
      `Approve sending this ${ACTION_TYPE_NOUN[activeAction.action_type]} request to ${contract.provider}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            await approveAgentAction(activeAction.id);
            refresh();
          },
        },
      ]
    );
  };

  const handleMarkSent = () => {
    if (!activeAction) return;
    Alert.alert("Confirm you've sent this?", 'This marks the action as executed and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: "I've sent this",
        onPress: async () => {
          await markAgentActionExecuted(activeAction.id, 'sent_manually');
          refresh();
        },
      },
    ]);
  };

  const handleReject = () => {
    if (!activeAction) return;
    Alert.alert('Reject this proposal?', 'This discards the current draft and alternatives.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          await rejectAgentAction(activeAction.id);
          refresh();
        },
      },
    ]);
  };

  if (!contract) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{contract.provider}</Text>
      <View style={styles.card}>
        {contract.renewal_date && <Text style={styles.cardText}>Renews on {contract.renewal_date}</Text>}
        {contract.current_amount !== null && (
          <Text style={styles.cardText}>Current amount: €{contract.current_amount.toFixed(2)}</Text>
        )}
      </View>

      {!activeAction && <Button title="Find alternatives" onPress={handleFindAlternatives} loading={busy} />}

      {activeAction && activeAction.alternatives === null && (
        <Button title="Find alternatives" onPress={handleFindAlternatives} loading={busy} />
      )}

      {activeAction && activeAction.alternatives !== null && (
        <AlternativesList alternatives={activeAction.alternatives} />
      )}

      {activeAction && activeAction.status === 'proposed' && activeAction.alternatives !== null && !activeAction.draft_content && (
        <View style={{ gap: spacing.sm }}>
          <ChipRow options={ACTION_TYPE_OPTIONS} value={selectedActionType} onChange={setSelectedActionType} />
          <Button title="Generate draft" onPress={handleGenerateDraft} loading={busy} />
        </View>
      )}

      {activeAction?.draft_content && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionTitle}>{activeAction.status === 'approved' ? 'Approved draft' : 'Draft'}</Text>
          <DraftPreview draft={activeAction.draft_content} onCopy={handleCopy} />
          {activeAction.status === 'proposed' && <Button title="Approve this action" onPress={handleApprove} />}
          {activeAction.status === 'approved' && <Button title="I've sent this" onPress={handleMarkSent} variant="accent" />}
        </View>
      )}

      {activeAction && <Button title="Reject" onPress={handleReject} variant="primary" />}

      <AgentActionHistory actions={actions} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardText: { fontFamily: fonts.body, color: colors.white },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
});
