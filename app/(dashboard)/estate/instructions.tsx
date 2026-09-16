import { useCallback, useState } from 'react';
import { Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, spacing, radius } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { fetchEstateInstructions, upsertEstateInstructions } from '@/lib/estate';
import { Button } from '@/components/ui/Button';

export default function InstructionsScreen() {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchEstateInstructions(user.id).then((instructions) => {
        setContent(instructions?.content ?? '');
        setLoaded(true);
      });
    }, [user])
  );

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await upsertEstateInstructions(user.id, content);
    setSaving(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Instructions</Text>
      <Text style={styles.subtitle}>Visible only to trusted people you grant access to this section.</Text>

      {!loaded || !user ? (
        <Text style={styles.subtitle}>Loading…</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={8}
            placeholder="Write instructions for your trusted people…"
            placeholderTextColor={colors.neutralMid}
          />
          <Button title="Save" variant="accent" loading={saving} onPress={handleSave} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  subtitle: { fontFamily: fonts.body, color: colors.border },
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
    minHeight: 160,
    textAlignVertical: 'top',
  },
});
