import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function TrustedPeopleLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgDarkest },
      }}
    />
  );
}
