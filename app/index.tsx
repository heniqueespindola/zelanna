import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/hooks/useOnboarding';

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { onboardingCompleted, loading: onboardingLoading } = useOnboarding();

  if (authLoading || (session && onboardingLoading)) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <Redirect href={onboardingCompleted ? '/(dashboard)' : '/onboarding/step1'} />;
}
