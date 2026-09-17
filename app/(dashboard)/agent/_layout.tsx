import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function AgentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgDarkest },
      }}
    />
  );
}
