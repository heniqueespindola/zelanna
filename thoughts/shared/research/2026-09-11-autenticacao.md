---
data: 2026-09-11
feature: "Autenticação (login, registo, protecção de rotas)"
status: completo
---

# Research: Autenticação (login, registo, protecção de rotas)

## Questão de Pesquisa

Como configurar o cliente Supabase Auth em Expo/React Native (SDK 57) com persistência de sessão, e qual o padrão recomendado de protecção de rotas com Expo Router para o grupo `(dashboard)` deste scaffold? (Pergunta herdada do ticket `thoughts/shared/tickets/2026-09-11-autenticacao.md`.)

## Sumário

O scaffold já tem os ecrãs placeholder (`login.tsx`, `register.tsx`) e o layout de tabs (`(dashboard)/_layout.tsx`) prontos, mas **nada de Supabase existe ainda**: sem dependência `@supabase/supabase-js`, sem `src/lib/supabase.ts`, sem `src/hooks/useAuth.ts`, sem `supabase/schema.sql`. O `.env` já tem as chaves `EXPO_PUBLIC_SUPABASE_*` reservadas (uma já preenchida). Falta instalar `@supabase/supabase-js` e um storage adapter (AsyncStorage é o caminho pragmático — ver secção de APIs externas), criar o cliente, o hook de auth, ligar os dois formulários existentes, e substituir a lógica de redirect fixa em `app/index.tsx` e o `Stack` em `app/_layout.tsx` por protecção de rotas real usando `Stack.Protected` (disponível na versão de Expo Router deste projecto).

## Ficheiros Relevantes da Codebase

- `app/index.tsx` — actualmente faz sempre `<Redirect href="/(auth)/login" />`, com comentário `TODO: F01 — trocar por lógica real de sessão (useAuth) quando o Supabase Auth estiver ligado`. Ponto de entrada a substituir pela lógica de sessão.
- `app/_layout.tsx` — root layout com `Stack` contendo `(auth)`, `onboarding`, `(dashboard)` como `Stack.Screen` simples, sem qualquer guarda. É aqui que entra o padrão `Stack.Protected` e o provider de auth.
- `app/(auth)/login.tsx` — UI já usa a paleta e tipografia do tema (`colors.bgDarkest`, `colors.primary`, `colors.accent`, `fonts.display`/`fonts.body`), mas o botão "Log in" é um `Pressable` sem `onPress`, sem inputs de email/password. Comentário `TODO: F01 — formulário de login com Supabase Auth (email + password)`.
- `app/(auth)/register.tsx` — mesmo estado que `login.tsx`: título, botão sem lógica, `TODO: F01 — formulário de registo com Supabase Auth`.
- `app/(dashboard)/_layout.tsx` — `Tabs` com 5 ecrãs (`index`, `documents`, `coverage`, `bills`, `settings`), sem qualquer verificação de sessão.
- `app/(dashboard)/settings.tsx` — placeholder com `TODO: perfil, plano (Stripe), privacidade, logout` — é onde a acção de logout desta feature deve ser adicionada.
- `src/constants/theme.ts` — já exporta `colors`, `fonts`, `spacing`, `radius` prontos a usar (`colors.bgDarkest = '#131E15'`, `colors.primary = '#324138'`, `colors.accent = '#C9A15C'`, `colors.white`, `fonts.display = 'Avenir'`, `fonts.body = 'Lato'`). Nota: comentário no ficheiro avisa que Avenir/Lato "não vêm com o Expo" — os `.ttf` ainda não foram adicionados a `src/assets/fonts/` nem carregados via `expo-font` (fora do escopo desta feature, mas os componentes já devem referenciar `fonts.display`/`fonts.body`).
- `src/hooks/`, `src/lib/`, `src/stores/`, `src/types/` — **não existem ainda** (só `src/constants/theme.ts` existe dentro de `src/`). Terão de ser criados de raiz.
- `tsconfig.json` — confirma o path alias `@/*` → `./src/*`, já usado nos ecrãs existentes (`@/constants/theme`).
- `app.json` — `scheme: "zelanna"` já configurado (útil para deep links de confirmação de email/reset de password no futuro), plugin `expo-secure-store` já registado, `bundleIdentifier`/`package` = `com.mocruz.zelanna`.
- `package.json` — dependências actuais: `expo ~57.0.21`, `expo-router ~57.0.20`, `expo-secure-store ~57.0.3`, `react 19.2.3`, `react-native 0.86.3`. **Não** inclui `@supabase/supabase-js` nem `@react-native-async-storage/async-storage`. Script `typecheck` (`tsc --noEmit`) já existe e corresponde à regra do projecto de correr antes de commit.
- `.env` / `.env.example` — `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` já reservados; `.env` está correctamente no `.gitignore`. O valor de `EXPO_PUBLIC_SUPABASE_URL` já parece preenchido no `.env` local (não inspeccionado o valor em si).
- `supabase/` — a pasta **não existe** no repositório; não há `schema.sql` nem migrations aplicadas ainda.

## Padrões de Implementação Existentes

Não há nenhum padrão de auth, hooks ou chamadas a Supabase já implementado no projecto — este é o primeiro código deste tipo. O único padrão reutilizável existente é o estilo dos ecrãs placeholder, que a implementação deve seguir:

```tsx
// Padrão actual em app/(auth)/login.tsx e register.tsx
import { colors, fonts, spacing, radius } from '@/constants/theme';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDarkest, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.white, textAlign: 'center' },
  button: { backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  buttonText: { fontFamily: fonts.body, color: colors.white, fontSize: 16, fontWeight: '600' },
  link: { fontFamily: fonts.body, color: colors.accent, textAlign: 'center', marginTop: spacing.sm },
});
```

Este padrão (tokens do tema, sem hex soltos, `fontFamily` de `fonts.*`) deve ser seguido nos componentes `Input`/`Button` de `src/components/ui/` que esta feature precisará de criar (ainda não existem).

## Tabelas/Queries Supabase Relevantes

Nenhuma tabela existe ainda em código (`supabase/` está vazio). O schema alvo, conforme documentado em `CLAUDE.md`, inclui a tabela base relevante para esta feature:

```sql
users (
  id uuid PRIMARY KEY references auth.users,
  created_at timestamptz DEFAULT now()
)
```

Todas as restantes tabelas (`documents`, `assets`, `contracts`, `coverage`, `bills`, `events`, `insights`) referenciam `user_id uuid REFERENCES users(id) ON DELETE CASCADE` e devem ter RLS activo — mas nenhuma delas é necessária para esta feature de autenticação em si; ficam apenas como consumidoras futuras de `auth.uid()`. `CLAUDE.md` exige RLS em todas as tabelas ("Utilizador só acede aos seus próprios dados") — a criação de `supabase/schema.sql` com estas tabelas e políticas RLS é pré-requisito de setup (já assinalado como pendente na checklist do `CLAUDE.md`), não parte desta ficha, mas a tabela `users` (ou o padrão de trigger `on auth.users insert`) tem de existir para que o fluxo de registo funcione fim-a-fim.

## APIs Externas Relevantes

### Cliente Supabase Auth em Expo/React Native

Não existe hoje uma única resposta "oficial" — há três caminhos documentados por fontes diferentes da própria Supabase/Expo:

1. **Quickstart clássico da Supabase** (`supabase.com/docs/guides/auth/quickstarts/react-native`) — usa `@react-native-async-storage/async-storage` como storage adapter. Continua a ser o caminho mais simples e testado, sem risco de falha silenciosa por limite de tamanho.
2. **Docs da própria Expo** (`docs.expo.dev/guides/using-supabase/`) — recomendam agora o shim `expo-sqlite/localStorage/install`, evitando AsyncStorage por completo.
3. **Exemplo de referência da Supabase para Expo** (`github.com/supabase/supabase/tree/master/examples/auth/expo-social-auth`) — usa `expo-secure-store` directamente como adapter (o que já está instalado neste projecto), mas com um aviso conhecido: valores de sessão acima de 2048 bytes (comum em JWTs de sessão Supabase com access+refresh token) só emitem um `console.warn` e podem falhar a gravar silenciosamente no iOS Keychain. O padrão "correcto" descrito na prosa da documentação (chave AES em SecureStore + blob cifrado em AsyncStorage) **não está implementado no código de exemplo real** — é só uma recomendação narrativa, não um utilitário oficial já pronto no `@supabase/supabase-js`.

Opções de `createClient` confirmadas em todas as fontes:
```ts
auth: {
  storage,                 // adapter de plataforma
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,  // RN não tem URL para ler sessão/redirect OAuth
}
```

Padrão de refresh em foreground/background (documentado pela Supabase para RN):
```ts
import { AppState } from 'react-native';
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

Adapter de referência usando `expo-secure-store` (do exemplo oficial da Supabase, com o aviso de tamanho incluído):
```ts
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => getItemAsync(key),
  setItem: (key: string, value: string) => {
    if (value.length > 2048) {
      console.warn('Value being stored in SecureStore is larger than 2048 bytes and it may not be stored successfully.');
    }
    return setItemAsync(key, value);
  },
  removeItem: (key: string) => deleteItemAsync(key),
};
```

Fontes: [Supabase Auth quickstart – React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native) · [Supabase quickstart – Expo Social Auth](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth) · [Expo docs – Using Supabase](https://docs.expo.dev/guides/using-supabase/) · [supabase/supabase — examples/auth/expo-social-auth](https://github.com/supabase/supabase/tree/master/examples/auth/expo-social-auth) · [Supabase blog – React Native authentication](https://supabase.com/blog/react-native-authentication)

### Protecção de rotas com Expo Router

`Stack.Protected` (e o equivalente `Tabs.Protected`) é o mecanismo actualmente recomendado, introduzido no Expo Router v5 (SDK 53) e presente sem alterações relevantes no changelog do SDK 57 — logo, disponível na versão instalada neste projecto (`expo-router ~57.0.20`). Substitui o padrão mais antigo de `<Redirect />` manual dentro do layout (esse padrão continua documentado como alternativa, mas já não é a recomendação primária).

```tsx
function RootNavigator() {
  const { isLoggedIn } = useAuthContext();
  return (
    <Stack>
      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
```

Quando `guard` passa a `false` para o ecrã activo, o Expo Router redirecciona automaticamente para o ecrã acessível mais próximo — sem necessidade de `<Redirect>` manual. A documentação oficial sublinha que isto é **apenas client-side** e não substitui autorização no servidor (consistente com a regra do `CLAUDE.md` de nunca fazer bypass de RLS).

Padrão para evitar o "flash" do ecrã de login antes do redirect (splash screen controlada pelo estado de loading da sessão):
```tsx
import { SplashScreen } from 'expo-router';
SplashScreen.preventAutoHideAsync();

export function SplashScreenController() {
  const { isLoading } = useAuthContext();
  if (!isLoading) SplashScreen.hideAsync();
  return null;
}
```
Renderizado dentro do provider de auth, ao lado do navigator (não a envolvê-lo):
```tsx
<AuthProvider>
  <SplashScreenController />
  <RootNavigator />
</AuthProvider>
```

Não há race condition ao nível do router (todos os ecrãs estão sempre definidos; a protecção é avaliada em runtime) — a race real é a nível de aplicação (resolução da sessão inicial antes do primeiro render), mitigada pelo padrão de splash screen acima: manter `isLoading: true` até `supabase.auth.getSession()` resolver e um listener `onAuthStateChange` estar registado.

Fontes: [Expo docs – Protected routes](https://docs.expo.dev/router/advanced/protected/) · [Expo docs – Authentication in Expo Router](https://docs.expo.dev/router/advanced/authentication/) · [Expo blog – Simplifying auth flows with protected routes](https://expo.dev/blog/simplifying-auth-flows-with-protected-routes) · [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57)

## Code Snippets de Referência

Ver blocos de código nas secções "APIs Externas Relevantes" acima — cobrem: criação do cliente Supabase com `auth` options, adapter `expo-secure-store`, listener de `AppState` para refresh, `Stack.Protected` para o root layout, e `SplashScreenController` para evitar flash de UI durante a resolução da sessão inicial.

## Questões em Aberto

1. **AsyncStorage vs `expo-secure-store` vs `expo-sqlite/localStorage` como storage adapter.** O projecto já tem `expo-secure-store` instalado e configurado como plugin, mas o adapter oficial de exemplo da Supabase para SecureStore tem uma falha conhecida e não mitigada (sessões >2048 bytes podem falhar a gravar silenciosamente no iOS). As três opções encontradas na pesquisa não convergem numa única recomendação "oficial" actual. Esta decisão de arquitectura (qual storage adapter usar) deve ser tomada na fase `/plan`, não nesta fase de research.
2. **Confirmação de email no Supabase Auth** — já identificada no ticket original como decisão pendente (activar ou desactivar para reduzir fricção nos testes da Phase 0). Não encontrada nenhuma configuração actual no projecto Supabase (a própria pasta `supabase/` ainda não existe), pelo que esta continua em aberto.
3. **`supabase/schema.sql` e a tabela `users`** ainda não existem no repositório — é um pré-requisito de setup (já assinalado no `CLAUDE.md` como pendente) para que o registo crie de facto uma linha utilizável em `users` ligada a `auth.users`. Confirmar se isto é criado como parte da implementação desta feature ou tratado como tarefa de setup separada antes do `/plan`.
4. **Fontes Avenir/Lato** ainda não foram adicionadas a `src/assets/fonts/` nem carregadas via `expo-font`; os ecrãs actuais já referenciam `fonts.display`/`fonts.body` mas React Native cairá para a fonte de sistema até isso ser feito. Não bloqueia esta feature, mas afecta o resultado visual imediato dos ecrãs de login/registo.
5. **Versão exacta de `expo-router` instalada** é `~57.0.20`; o exemplo oficial da Supabase com `Stack.Protected` foi visto fixado a `expo-router ~6.0.23` (associado a Expo SDK ~54). Não foi encontrada, dentro do âmbito desta pesquisa, confirmação linha-a-linha de que a API `Stack.Protected` tem exactamente a mesma assinatura na versão ~57.0.20 deste projecto — o changelog do SDK 57 não regista alterações a protected routes, o que sugere compatibilidade, mas vale confirmar rapidamente ao implementar (ex: correr `expo-doctor` e verificar a tipagem de `Stack.Protected` no editor) antes de assumir a API tal como documentada.
