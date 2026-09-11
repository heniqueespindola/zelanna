import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return null; // SplashScreenController mantém o splash visível
  return <Redirect href={session ? '/(dashboard)' : '/(auth)/login'} />;
}
