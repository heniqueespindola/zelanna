import { Redirect } from 'expo-router';

// TODO: F01 — trocar por lógica real de sessão (useAuth) quando o Supabase Auth estiver ligado.
// Por agora, entra sempre no fluxo de login.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
