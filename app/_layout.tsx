import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { OnboardingProvider, useOnboarding } from '@/hooks/useOnboarding';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session } = useAuth();
  const { onboardingCompleted } = useOnboarding();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgDarkest },
      }}
    >
      <Stack.Protected guard={!!session && onboardingCompleted === true}>
        <Stack.Screen name="(dashboard)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && onboardingCompleted === false}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!session || onboardingCompleted === null}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function SplashScreenController() {
  const { loading: authLoading, session } = useAuth();
  const { loading: onboardingLoading } = useOnboarding();
  if (!authLoading && (!session || !onboardingLoading)) SplashScreen.hideAsync();
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <OnboardingProvider>
          <SplashScreenController />
          <RootNavigator />
        </OnboardingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
