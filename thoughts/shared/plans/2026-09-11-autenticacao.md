---
data: 2026-09-11
feature: "Autenticação (login, registo, protecção de rotas)"
research: "thoughts/shared/research/2026-09-11-autenticacao.md"
status: completo
---

# Spec: Autenticação (Login, Registo e Protecção de Rotas)

## Visão Geral

Liga os ecrãs placeholder de login/registo ao Supabase Auth, cria o hook/context `useAuth`, protege o grupo `(dashboard)` com `Stack.Protected`, e cria `supabase/schema.sql` (tabela `users` + trigger + RLS) para que o registo produza uma linha utilizável fim-a-fim.

## Decisões tomadas antes desta spec

- **Confirmação de email: ACTIVA.** `signUp()` não devolve sessão activa enquanto o email não for confirmado — o ecrã de registo tem de tratar este estado ("verifica o teu email") em vez de assumir login automático.
- **`supabase/schema.sql` incluído nesta spec** (tabela `users`, trigger a partir de `auth.users`, políticas RLS) — sem isto o registo não produz uma linha utilizável em `users`.
- **Storage adapter: `@react-native-async-storage/async-storage`** (decisão já fixada no ticket original, critério de aceitação existente — não `expo-secure-store`, que tem falha conhecida em sessões >2048 bytes).
- **Navegação pós-login/registo/logout: automática via `Stack.Protected`**, sem `router.replace()` manual — quando o `guard` de um grupo passa a `false` para o ecrã activo, o Expo Router redirecciona sozinho para o ecrã acessível mais próximo (confirmado na secção "APIs Externas" do research). `app/index.tsx` continua a fazer o redirect inicial explícito (é o ecrã de entrada em "/", fora dos grupos `(auth)`/`(dashboard)`).

## Dependências a instalar

Correr (não `npm install` directo — `expo install` fixa versões compatíveis com o SDK 57):

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

- `@supabase/supabase-js` — cliente Supabase
- `@react-native-async-storage/async-storage` — storage adapter de sessão (obrigatório em RN, `localStorage` não existe)
- `react-native-url-polyfill` — sem isto, `createClient` do supabase-js falha em runtime em React Native (`URL` não está totalmente implementado no engine RN); importar `react-native-url-polyfill/auto` no topo de `src/lib/supabase.ts` antes de `createClient`

Não é necessário adicionar nada a `app.json` → `plugins` (nenhum dos três pacotes acima requer config plugin).

## Ficheiros a Criar

### `supabase/schema.sql`
**Propósito:** Tabela `users` ligada a `auth.users`, trigger que cria automaticamente a linha ao registar, e políticas RLS — pré-requisito para que o registo produza dados utilizáveis pelas features futuras (`documents`, `assets`, `contracts`, etc., todas com `user_id references users(id)`).
**Conteúdo:**
```sql
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own row"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own row"
  on public.users for update
  using (auth.uid() = id);

-- Cria automaticamente uma linha em public.users quando alguém se regista em auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```
**Nota:** este ficheiro é aplicado manualmente no SQL Editor do projecto Supabase (região EU, conforme `CLAUDE.md`) — não há migration runner configurado neste projecto ainda. Confirmar no dashboard Supabase (Authentication → Providers → Email) que "Confirm email" está activo (é o valor por defeito do Supabase, pelo que normalmente não requer alteração).

### `src/lib/supabase.ts`
**Propósito:** Cliente Supabase único, partilhado por toda a app, com persistência de sessão via AsyncStorage.
**Conteúdo:**
```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

### `src/lib/authErrors.ts`
**Propósito:** Traduz mensagens de erro cruas do Supabase Auth para mensagens amigáveis em inglês (UI English-first, conforme `CLAUDE.md`) — critério de aceitação explícito do ticket.
**Conteúdo:**
```ts
import type { AuthError } from '@supabase/supabase-js';

export function getAuthErrorMessage(error: AuthError): string {
  switch (error.message) {
    case 'Invalid login credentials':
      return 'Incorrect email or password.';
    case 'User already registered':
      return 'An account with this email already exists.';
    case 'Password should be at least 6 characters':
      return 'Password must be at least 6 characters.';
    case 'Unable to validate email address: invalid format':
      return 'Please enter a valid email address.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
```
Exportar também uma função `isValidEmail(email: string): boolean` (regex simples) usada pela validação client-side em `login.tsx`/`register.tsx`, para não depender só da resposta da API.

### `src/hooks/useAuth.tsx`
**Propósito:** Context + hook central de autenticação — sessão, utilizador, loading, `signIn`, `signUp`, `signOut`. Usado por `app/_layout.tsx`, `app/index.tsx`, `login.tsx`, `register.tsx`, `settings.tsx`.
**Conteúdo:**
```tsx
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, []);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp: AuthContextValue['signUp'] = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { error, needsEmailConfirmation: !error && !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```
**Nota:** `needsEmailConfirmation` é `true` quando `signUp()` não devolve `data.session` (caso de confirmação de email activa) — é o sinal que `register.tsx` usa para mostrar o estado "verifica o teu email" em vez de esperar redirect automático.

### `src/components/ui/Input.tsx`
**Propósito:** Primeiro componente UI reutilizável do projecto (`src/components/ui/` está vazio) — usado por `login.tsx` e `register.tsx`, reutilizável por features futuras.
**Conteúdo:**
- Props: `label: string`, `value: string`, `onChangeText: (v: string) => void`, `error?: string`, `secureTextEntry?: boolean`, `keyboardType?: KeyboardTypeOptions`, `autoCapitalize?: TextInputProps['autoCapitalize']`, `placeholder?: string`
- Usa `TextInput` do React Native, estilizado com tokens de `@/constants/theme` (`colors.surfaceAlt` como fundo do campo, `colors.border` como borda, `colors.critical` para o estado de erro, `fonts.body`)
- Renderiza `label` acima do campo e `error` (se existir) abaixo, em `colors.critical`
- Máximo 150 linhas (regra do projecto)

### `src/components/ui/Button.tsx`
**Propósito:** Botão reutilizável com estado de loading — usado nos dois formulários e no botão de logout.
**Conteúdo:**
- Props: `title: string`, `onPress: () => void`, `loading?: boolean`, `disabled?: boolean`, `variant?: 'primary' | 'accent'` (default `'primary'`)
- `variant='primary'` → `backgroundColor: colors.primary`; `variant='accent'` → `backgroundColor: colors.accent`
- Quando `loading` é `true`: mostra `ActivityIndicator` (`color: colors.white`) no lugar do texto e desactiva `onPress`
- Quando `disabled` é `true` (e não loading): `opacity: 0.5`, `onPress` inactivo
- Usa `Pressable`, tokens de `@/constants/theme` (`radius.md`, `spacing.md`, `fonts.body`)

## Ficheiros a Modificar

### `src/lib/supabase.ts` → já coberto em "Ficheiros a Criar"

### `app/_layout.tsx`
**Modificações:**
- [ ] Importar `SplashScreen` de `expo-router` (em vez de `expo-splash-screen`, para manter um único import de `expo-router`) e chamar `SplashScreen.preventAutoHideAsync()` no topo do módulo
- [ ] Importar `AuthProvider`, `useAuth` de `@/hooks/useAuth`
- [ ] Extrair o `<Stack>` actual (linhas 10–19) para um novo componente interno `RootNavigator()`, que usa `const { session } = useAuth()` e substitui a lista plana de `<Stack.Screen>` por:
  ```tsx
  <Stack.Protected guard={!!session}>
    <Stack.Screen name="(dashboard)" />
  </Stack.Protected>
  <Stack.Protected guard={!session}>
    <Stack.Screen name="(auth)" />
  </Stack.Protected>
  <Stack.Screen name="onboarding" />
  ```
  (`onboarding` fica fora do escopo desta ficha — mantém-se como ecrã não protegido, tal como hoje, ver `## Fora do escopo` no ticket)
- [ ] Adicionar componente interno `SplashScreenController()`: `const { loading } = useAuth(); if (!loading) SplashScreen.hideAsync(); return null;`
- [ ] `RootLayout()` passa a envolver `<RootNavigator />` com `<AuthProvider><SplashScreenController /><RootNavigator /></AuthProvider>`, dentro do `<SafeAreaProvider>` existente (mantém `<StatusBar style="light" />` como está)
- [ ] Manter `screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgDarkest } }}` no `<Stack>` dentro de `RootNavigator`

### `app/index.tsx`
**Modificações:**
- [ ] Remover o `<Redirect href="/(auth)/login" />` fixo e o comentário `TODO: F01` (linhas 3–6)
- [ ] Importar `useAuth` de `@/hooks/useAuth`
- [ ] Novo corpo:
  ```tsx
  export default function Index() {
    const { session, loading } = useAuth();
    if (loading) return null; // SplashScreenController mantém o splash visível
    return <Redirect href={session ? '/(dashboard)' : '/(auth)/login'} />;
  }
  ```

### `app/(auth)/login.tsx`
**Modificações:**
- [ ] Substituir os imports de `react-native` (`View`, `Text`, `StyleSheet`, `Pressable`) — manter `View`, `Text`, `StyleSheet`; remover `Pressable` (passa a usar `Button`)
- [ ] Importar `useState` de `react`, `useAuth` de `@/hooks/useAuth`, `Input` de `@/components/ui/Input`, `Button` de `@/components/ui/Button`, `getAuthErrorMessage`/`isValidEmail` de `@/lib/authErrors`
- [ ] Estado local: `email`, `password`, `error: string | null`, `submitting: boolean`
- [ ] Validação client-side antes de chamar `signIn`: email não vazio + `isValidEmail(email)`, password não vazia — se falhar, define `error` local sem chamar a API
- [ ] `handleLogin`: `setSubmitting(true)`, chama `await signIn(email, password)`, se `error` define `setError(getAuthErrorMessage(error))`, sempre `setSubmitting(false)` no fim (não há navegação manual — `Stack.Protected` trtrata o redirect quando a sessão fica preenchida)
- [ ] Substituir o `{/* TODO: F01 */}` (linha 13) por dois `<Input>` (email — `keyboardType="email-address"`, `autoCapitalize="none"` — e password — `secureTextEntry`) e, se `error`, um `<Text style={styles.error}>{error}</Text>` acima do botão
- [ ] Substituir `<Pressable style={styles.button}>...</Pressable>` (linhas 15–17) por `<Button title="Log in" onPress={handleLogin} loading={submitting} />`
- [ ] Adicionar ao `StyleSheet.create` um estilo `error: { fontFamily: fonts.body, color: colors.critical, textAlign: 'center' }`
- [ ] Manter o `<Link href="/(auth)/register">` tal como está

### `app/(auth)/register.tsx`
**Modificações:**
- [ ] Mesmos imports base que `login.tsx` (`useState`, `useAuth`, `Input`, `Button`, `getAuthErrorMessage`, `isValidEmail`)
- [ ] Estado local: `email`, `password`, `confirmPassword`, `error: string | null`, `submitting: boolean`, `confirmationSent: boolean`
- [ ] Validação client-side: email válido, password com pelo menos 6 caracteres (mínimo por defeito do Supabase Auth), `password === confirmPassword` (senão `error = 'Passwords do not match.'`, sem chamar a API)
- [ ] `handleRegister`: `setSubmitting(true)`, chama `const { error, needsEmailConfirmation } = await signUp(email, password)`; se `error`, `setError(getAuthErrorMessage(error))`; senão se `needsEmailConfirmation`, `setConfirmationSent(true)` (a sessão continua `null`, o `Stack.Protected` não navega); `setSubmitting(false)` sempre
- [ ] Substituir o `{/* TODO: F01 */}` (linha 10) por: se `confirmationSent` → bloco de mensagem "We sent a confirmation link to **{email}**. Confirm your email, then log in." com um `<Link href="/(auth)/login">` de volta ao login; senão → três `<Input>` (email, password, confirm password) + `error` (mesmo padrão do login) + `<Button title="Sign up" onPress={handleRegister} loading={submitting} />`
- [ ] Manter o `<Link href="/(auth)/login">` existente (linhas 16–18) apenas no ramo "formulário", não no ramo "confirmationSent" (que já tem o seu próprio link, ver acima)
- [ ] Reutilizar o estilo `error` (igual ao de `login.tsx`)

### `app/(dashboard)/settings.tsx`
**Modificações:**
- [ ] Importar `useAuth` de `@/hooks/useAuth`, `Button` de `@/components/ui/Button`
- [ ] Substituir `{/* TODO: perfil, plano (Stripe), privacidade, logout */}` (linha 10) por um `<Button title="Log out" variant="accent" onPress={() => supabase... }` — na prática: `const { signOut } = useAuth(); <Button title="Log out" variant="accent" onPress={signOut} />` (sem confirmação adicional nesta fase — "pode ser um botão simples nesta fase", conforme critério de aceitação do ticket)
- [ ] Não é necessário `router.replace()` — ao ficar `session === null`, `Stack.Protected` em `app/_layout.tsx` redirecciona automaticamente para `(auth)/login`
- [ ] Manter `TODO` residual apenas para o que fica mesmo fora de escopo: `{/* TODO: perfil, plano (Stripe), privacidade */}`

### `app/(dashboard)/_layout.tsx`
**Sem modificações.** A protecção acontece ao nível do grupo `(dashboard)` inteiro em `app/_layout.tsx` (`Stack.Protected`) — não é necessário `Tabs.Protected` nem guardas individuais por tab.

### `.env.example`
**Sem modificações.** `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` já estão reservados (linhas 2–3). Confirmar apenas que `.env` local tem os dois valores reais preenchidos (pré-requisito de setup já assinalado no `CLAUDE.md`).

### `package.json`
**Modificações:**
- [ ] `dependencies`: adicionar `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill` (versões fixadas automaticamente por `npx expo install`, não escrever números à mão)

## Fases de Implementação

### Fase 1: Base de dados e cliente Supabase — fundação sem UI
**Ficheiros:**
- Criar `supabase/schema.sql` e aplicar no SQL Editor do projecto Supabase (região EU)
- Correr `npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill` (actualiza `package.json`)
- Criar `src/lib/supabase.ts`
- Criar `src/lib/authErrors.ts`

**Critérios de sucesso (automáticos):**
- [x] `npm run typecheck` (`tsc --noEmit`) passa sem erros
- [x] `npm run lint` (`expo lint`) passa sem warnings novos — 4 erros pré-existentes em ecrãs placeholder fora do escopo (`login.tsx`, `coverage.tsx`, `(dashboard)/index.tsx`, `onboarding/step3.tsx`), nenhum nos ficheiros novos desta fase

**Critérios de sucesso (manuais):**
- [ ] No SQL Editor do Supabase, confirmar que `select * from public.users;` corre sem erro (tabela criada)
- [ ] Em Authentication → Providers → Email, confirmar que "Confirm email" está activo

### Fase 2: Contexto de autenticação
**Ficheiros:**
- Criar `src/hooks/useAuth.tsx`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` sem erros (sem `any`, sem `@ts-ignore`)

**Critérios de sucesso (manuais):**
- [x] Nenhum ainda — `AuthProvider` não está montado em lado nenhum até à Fase 4

### Fase 3: Componentes UI reutilizáveis
**Ficheiros:**
- Criar `src/components/ui/Input.tsx`
- Criar `src/components/ui/Button.tsx`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` sem erros
- [x] Ambos os ficheiros com menos de 150 linhas (Input.tsx: 71, Button.tsx: 55)

**Critérios de sucesso (manuais):**
- [x] N/A — sem consumidores ainda

### Fase 4: Protecção de rotas + ecrãs de login/registo/logout
**Ficheiros:**
- Modificar `app/_layout.tsx`
- Modificar `app/index.tsx`
- Modificar `app/(auth)/login.tsx`
- Modificar `app/(auth)/register.tsx`
- Modificar `app/(dashboard)/settings.tsx`

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` sem erros
- [x] `expo lint` sem warnings novos — mesmos 4 erros pré-existentes da Fase 1 (incluindo o apóstrofo em `login.tsx`, já presente no texto original antes desta fase)
- [x] `npx expo-doctor` sem novos avisos relacionados com `Stack.Protected`/tipagem do `expo-router` — 1 check falha por drift de patch versions do SDK (`expo`, `expo-router`, etc.), já assim no commit inicial, não relacionado com esta fase

**Divergência corrigida durante a verificação manual:** `<Stack.Screen name="onboarding" />` em `app/_layout.tsx` referenciava uma rota inexistente (só existem `onboarding/step1`, `step2`, `step3`, sem `_layout.tsx`/`index.tsx` em `onboarding/`) — bug pré-existente no scaffold original, tornado visível pela validação explícita de filhos do `Stack.Protected`. Corrigido removendo a linha; `onboarding/*` continua acessível via file-based routing e não protegido, sem tocar nesses ficheiros (fora de escopo).

**Critérios de sucesso (manuais, no simulador iOS/Android):**
- [x] Registo com email/password válidos → aparece o estado "verifica o teu email", sem navegar para o dashboard
- [x] Login com credenciais de uma conta já confirmada manualmente no dashboard Supabase → navega automaticamente para `(dashboard)` sem `Redirect` manual visível
- [x] Login com password errada → mensagem "Incorrect email or password." (nunca a string crua do Supabase), sem crash
- [x] Registo com email já existente → mensagem "An account with this email already exists."
- [x] Com sessão activa, forçar deep link para `/bills` ou `/coverage` (ex: `expo start` → abrir link `zelanna://bills`) — carrega o ecrã (dentro do dashboard protegido)
- [x] Sem sessão, forçar deep link para `/bills` → redirecciona para `(auth)/login`, nunca mostra o conteúdo do dashboard
- [x] Fechar e reabrir a app com sessão previamente válida → vai direto para `(dashboard)`, sem passar por login (confirma persistência via AsyncStorage)
- [x] A partir de `settings.tsx`, tocar "Log out" → sessão termina, app volta automaticamente para `(auth)/login`
- [x] Sem flash do ecrã de login antes do dashboard aparecer no arranque com sessão válida (splash screen cobre o loading)

## Estratégia de Testes

- **Unit:** não há test runner configurado no projecto ainda (fora de escopo introduzi-lo nesta ficha) — validação feita via `tsc --noEmit` + `expo lint` + os critérios manuais acima
- **Manual:** correr os passos da Fase 4 em simulador iOS e emulador Android (paridade entre plataformas, já que `Stack.Protected` e AsyncStorage têm comportamento potencialmente diferente por plataforma)

## Notas de Implementação

- **Cálculo determinístico não se aplica aqui** — esta ficha é puramente autenticação/routing, sem regras de negócio (rules engine, LLM) envolvidas.
- **Nunca commitar `.env`** — já está no `.gitignore`, confirmar antes de qualquer commit desta ficha.
- **Confirmar a assinatura de `Stack.Protected` na versão instalada (`expo-router ~57.0.20`)** antes de assumir a API tal como documentada — questão em aberto nº5 do research não totalmente resolvida; se `Stack.Protected` não aceitar `guard` como booleano simples ou tiver comportamento diferente, ajustar a Fase 4 mas manter o padrão de dois grupos (`(dashboard)` vs `(auth)`) como alvo.
- **`onboarding/*` fica deliberadamente não protegido nesta ficha** — não faz parte do fluxo de login/registo actual (que vai direto para `(dashboard)`), é uma decisão já registada no ticket como fora de escopo.
- **`needsEmailConfirmation` depende do comportamento exacto do Supabase** com "Confirm email" activo: `signUp()` devolve `data.user` preenchido mas `data.session === null`. Confirmar este comportamento manualmente na Fase 1 antes de codificar a Fase 4 (pode variar ligeiramente por versão do `@supabase/supabase-js`).
- **RLS:** a tabela `users` criada na Fase 1 já fica com RLS activa e políticas mínimas (ver/actualizar a própria linha). Tabelas futuras (`documents`, `assets`, etc.) replicam o padrão `using (auth.uid() = user_id)` — fora do escopo desta ficha, mas a tabela `users` serve de referência.
- **Sem login social nem MFA nem "esqueci-me da password"** nesta ficha — confirmado como fora de escopo no ticket original.

## Referências

- Research: `thoughts/shared/research/2026-09-11-autenticacao.md`
- Ticket: `thoughts/shared/tickets/2026-09-11-autenticacao.md`
- Padrão de estilo a seguir: `app/(auth)/login.tsx` (tokens de `src/constants/theme.ts`, sem hex soltos)
