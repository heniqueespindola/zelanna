---
data: 2026-09-11
feature: "Onboarding (3 ecrãs — objectivo, primeiro documento, primeiro insight)"
status: completo
---

# Research: Onboarding (F02)

## Questão de Pesquisa

Como implementar upload de documento com preview de extracção em tempo real em Expo (SDK 57) — Supabase Storage + chamada a Vision LLM — e qual o padrão recomendado para persistir e consultar o estado "onboarding_completed" por utilizador antes do redirect em `app/index.tsx`? (Pergunta herdada do ticket `thoughts/shared/tickets/2026-09-11-onboarding.md`.)

## Sumário

Os três ecrãs de `app/onboarding/*` existem apenas como UI estática com `TODO`s — sem estado, sem upload, sem chamadas de rede — e **não estão registados no `Stack` de `app/_layout.tsx`**, pelo que hoje são inacessíveis a partir do fluxo real da app (o redirect em `app/index.tsx` só decide entre `(dashboard)` e `(auth)/login`). A feature de Autenticação (F01), apesar do ticket dizer `status: backlog`, **já está implementada e funcional** (login, registo, `useAuth`, guard `Stack.Protected`), o que remove o bloqueio teórico assinalado no ticket do onboarding — mas o Passo 2 (upload + extracção) depende de capacidades da feature **F03 — Upload de documentos + extração AI**, que **não existe em nenhuma forma** (sem Edge Function, sem `src/lib/extraction.ts`, sem dependências de picker instaladas, sem tabela `documents` no schema). Esta é a decisão mais importante a resolver antes do `/plan`: se o onboarding implementa a sua própria versão mínima de upload+extracção, ou se depende da conclusão prévia de F03.

## Ficheiros Relevantes da Codebase

- `app/onboarding/step1.tsx` (63 linhas) — UI estática, `TODO: F02 — multi-select do objetivo principal` (linha 14), sem estado nem gravação de selecção. Botão "Continue" é um `Link` simples para `step2`.
- `app/onboarding/step2.tsx` (63 linhas) — UI estática, `TODO: F03 — upload de documento + preview da extração Vision LLM` (linha 14), sem picker, sem chamada a Storage/Edge Function.
- `app/onboarding/step3.tsx` (70 linhas) — UI estática, `TODO: F02/F03 — este é o "Aha Moment" gerado a partir do documento carregado` (linha 12), texto do insight **hardcoded**, sem leitura de dados reais. Botão final aponta para `/(dashboard)`.
- `app/index.tsx` — já implementado (não placeholder): `const { session, loading } = useAuth(); return <Redirect href={session ? '/(dashboard)' : '/(auth)/login'} />`. **Não há ramificação para `/onboarding`** — é aqui que a lógica de "primeira abertura" terá de entrar.
- `app/_layout.tsx` (45 linhas) — `Stack.Protected` já protege `(dashboard)` vs `(auth)`, mas **`onboarding` não está registado no `Stack` de todo** (nem como `Stack.Screen`, nem dentro de nenhum `Stack.Protected`). Tem `SplashScreenController` ligado ao `loading` do `useAuth`, mas **não carrega fontes via `expo-font`** — não existe `useFonts`/`loadAsync` em nenhum ficheiro do projecto.
- `app/(dashboard)/_layout.tsx` — `Tabs` com 5 ecrãs, sem guard próprio (herda do layout pai).
- `src/hooks/useAuth.tsx` (72 linhas) — único hook existente, totalmente funcional (`AuthProvider`, `session`, `user`, `loading`, `signIn`, `signUp`, `signOut`, `AppState` para auto-refresh). Não expõe nada sobre onboarding.
- `src/lib/supabase.ts` (19 linhas) — cliente Supabase já configurado com `AsyncStorage` como storage adapter (decisão já tomada, ao contrário do que o research de autenticação deixava em aberto).
- `src/lib/extraction.ts`, `src/lib/rulesEngine.ts`, `src/lib/payments.ts` — **não existem**.
- `src/components/ui/Button.tsx`, `src/components/ui/Input.tsx` — únicos componentes reutilizáveis existentes, ambos completos.
- `src/components/documents/`, `dashboard/` (para `InsightCard`) — **não existem**; nenhum componente de progress indicator, upload, card ou insight reutilizável em todo o projecto.
- `src/types/` — **a pasta não existe**; sem `documents.ts`, `insights.ts`, etc.
- `supabase/schema.sql` (30 linhas) — **só contém a tabela `users` (`id`, `created_at`) com RLS e trigger `on_auth_user_created`**. Não tem campo `onboarding_completed`. As tabelas `documents`, `assets`, `contracts`, `coverage`, `bills`, `events`, `insights` descritas no `CLAUDE.md` **não existem neste ficheiro** — o schema aplicado é muito mais reduzido do que o modelo de dados completo documentado.
- `package.json` — **não** inclui `expo-image-picker`, `expo-document-picker`, `expo-file-system`, `expo-font`, `zustand`, nem `base64-arraybuffer`. Inclui `@supabase/supabase-js ^2.109.0`, `@react-native-async-storage/async-storage 2.2.0`, `expo-secure-store ~57.0.3` (instalado mas não usado — sessão usa `AsyncStorage`).
- `app.json` — sem nenhuma permissão de câmara/fototeca configurada (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, permissões Android inexistentes).
- `FEATURES.md` (287 linhas) — mapa de features F01–F14 referenciado pelo `CLAUDE.md`. **F02 (Onboarding)** e **F03 (Upload de documentos + extração AI)** são fichas distintas; F03 explicitamente diz "Nunca expor a chave da Vision LLM no cliente — chamada sempre via Edge Function" e "Guardar em `documents` (Supabase) com `extracted_data` em jsonb" — nenhuma destas peças existe ainda.
- `thoughts/shared/` — antes desta sessão só existia research/plan/ticket de autenticação; o ticket `2026-09-11-onboarding.md` foi criado nesta sessão (`/new-feature`) e ainda não tem plan.

## Padrões de Implementação Existentes

Padrão de tema já seguido nos ecrãs de onboarding (idêntico ao usado em `(auth)/*`), a reutilizar:

```tsx
// app/onboarding/step1.tsx — padrão actual
import { colors, fonts, spacing, radius } from '@/constants/theme';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgLight, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.black, textAlign: 'center' },
  button: { backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
});
```

Padrão de guard de rotas já em produção em `app/_layout.tsx`, a estender para incluir `onboarding`:

```tsx
<Stack.Protected guard={!!session}>
  <Stack.Screen name="(dashboard)" />
</Stack.Protected>
<Stack.Protected guard={!session}>
  <Stack.Screen name="(auth)" />
</Stack.Protected>
```

Padrão de hook de contexto (`useAuth.tsx`) a replicar caso se opte por um `useOnboarding`/estado equivalente — `AuthProvider` + `useContext`, com `loading` resolvido antes do primeiro redirect (evita flash de ecrã errado).

## Tabelas/Queries Supabase Relevantes

Estado actual real (`supabase/schema.sql`) — só isto está aplicado:

```sql
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- RLS + trigger on_auth_user_created já implementados
```

Nada relacionado com `documents`, `insights`, ou `onboarding_completed` existe. Duas famílias de opção documentadas para o flag de "onboarding já visto" (ver secção seguinte para fontes):

1. **Coluna em `public.users`** (ex: `onboarding_completed boolean not null default false`) — consistente com o padrão já usado neste projecto (tabela própria em `public`, populada por trigger a partir de `auth.users`), sem alterar `auth.users` directamente.
2. **`user_metadata` via `supabase.auth.updateUser({ data: { onboarding_completed: true } })`** — mais rápido de implementar (sem migration), mas cria risco de desync entre `auth.users.raw_user_meta_data` e a tabela `public.users`.

## APIs Externas Relevantes

### Selecção de documento (foto ou PDF) em Expo SDK 57

- **`expo-image-picker`** — `launchImageLibraryAsync({ mediaTypes: ['images'], base64: true })` devolve o asset já com string base64 pronta a converter (`'data:image/jpeg;base64,' + asset.base64`). Requer, no `app.json`, `NSPhotoLibraryUsageDescription` e `NSCameraUsageDescription` (iOS); no Android as permissões `CAMERA`/`READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE` são adicionadas automaticamente pelo plugin. — [Expo docs – ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- **`expo-document-picker`** — `getDocumentAsync({ type: 'application/pdf' })` devolve `{ uri, mimeType: 'application/pdf', name, size }`; por omissão copia o ficheiro para a cache directory (`copyToCacheDirectory`, activo por omissão). Não exige permissões adicionais em `app.json` para o caso básico. — [Expo docs – DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/)
- Nenhuma das duas libs está instalada no projecto — ambas terão de ser adicionadas via `npx expo install expo-image-picker expo-document-picker`.

### Upload para Supabase Storage a partir de Expo/React Native

Padrão confirmado em múltiplas fontes (tutorial oficial Supabase + discussões da comunidade): o `upload()` do Supabase JS **não aceita `Blob` directamente em React Native de forma fiável** — o caminho recomendado é converter para `ArrayBuffer` via `base64-arraybuffer`:

```ts
import { decode } from 'base64-arraybuffer';

const result = await ImagePicker.launchImageLibraryAsync({ base64: true });
const { data, error } = await supabase.storage
  .from('documents')
  .upload(`${userId}/${Date.now()}.jpg`, decode(result.assets[0].base64!), {
    contentType: 'image/jpeg',
  });
```

Alternativa via `fetch` + `expo-file-system` (usada quando não se pede `base64: true` ao picker, ex. para PDFs vindos do `expo-document-picker`, que não devolve base64 nativamente):

```ts
const response = await fetch(uri);
const blob = await response.blob();
const arrayBuffer = await new Response(blob).arrayBuffer();
await supabase.storage.from('documents').upload(path, arrayBuffer, { contentType: mimeType });
```

Dependência adicional necessária: `base64-arraybuffer` (não instalada). Há um problema documentado e conhecido na comunidade Supabase de uploads a dar 0 bytes quando se tenta passar `Blob`/`FormData` directamente em RN sem esta conversão — reforça que o caminho `ArrayBuffer` é o que deve ser seguido, não uma alternativa qualquer.

Fontes: [Supabase blog – React Native file upload with Supabase Storage](https://supabase.com/blog/react-native-storage) · [GitHub Discussion #1268 – Uploading images from Image Picker in Expo](https://github.com/supabase/supabase/discussions/1268) · [GitHub Discussion #2336 – Uploaded files showing up as 0 bytes](https://github.com/supabase/supabase/discussions/2336) · [GitHub Issue #7252 – Upload of ArrayBuffer ends up corrupted](https://github.com/supabase/supabase/issues/7252)

### Extracção via Vision LLM (Edge Function)

Não existe nenhuma Edge Function no projecto (`supabase/` só tem `schema.sql`, sem pasta `functions/`). O padrão de invocação do cliente, confirmado na documentação oficial:

```ts
const { data, error } = await supabase.functions.invoke('extract-document', {
  body: { documentPath: uploadedPath, documentType: 'invoice' },
});
```

`functions.invoke()` já trata automaticamente o header de autenticação (JWT do utilizador autenticado). A chave da Vision LLM **nunca** deve estar no cliente — deve ser guardada como secret/env var da Edge Function (`supabase secrets set`), acedida só server-side dentro da função, consistente com a regra do `CLAUDE.md` ("Nunca hardcodar chaves de API") e com o texto de F03 no `FEATURES.md` ("Nunca expor a chave da Vision LLM no cliente — chamada sempre via Edge Function"). — [Supabase docs – Edge Functions quickstart](https://supabase.com/docs/guides/functions/quickstart) · [Supabase docs – functions.invoke() reference](https://supabase.com/docs/reference/javascript/v1/functions-invoke)

### Persistência de "onboarding já visto"

Duas abordagens documentadas pela própria Supabase, sem uma única recomendação universal — a escolha depende do projecto:

1. **`user_metadata`** (`auth.users.raw_user_meta_data`) — actualizável directamente via `supabase.auth.updateUser({ data: { onboarding_completed: true } })`, sem precisar de tabela nem policy adicional. Risco: fica fora da tabela `public.users` que o projecto já usa como fonte de verdade, criando duas fontes de dados sobre o mesmo utilizador.
2. **Coluna numa tabela `public` (`profiles`/`users`)** — padrão que a própria documentação Supabase recomenda como "melhor prática" para dados adicionais de utilizador (o schema `auth` não é publicamente acessível), e é o padrão que este projecto **já segue** (a tabela `public.users` com trigger `on_auth_user_created` existe exactamente por este motivo). Adicionar `onboarding_completed boolean not null default false` a `public.users` é consistente com o schema actual.

Fontes: [Supabase docs – Managing user data](https://supabase.com/docs/guides/auth/managing-user-data) · [GitHub Discussion #4469 – Users/Accounts Table Name: Users vs Profiles](https://github.com/orgs/supabase/discussions/4469) · [GitHub Discussion #6363 – How to add additional metadata to users table?](https://github.com/orgs/supabase/discussions/6363)

## Code Snippets de Referência

Ver blocos de código na secção "APIs Externas Relevantes" acima — cobrem: `launchImageLibraryAsync` com `base64: true`, `getDocumentAsync` para PDFs, conversão `base64-arraybuffer`/`fetch`+`ArrayBuffer` para upload, `supabase.functions.invoke()` para a Edge Function de extracção, e as duas opções de schema para `onboarding_completed`.

## Questões em Aberto

1. **F02 depende de F03, que não existe.** O Passo 2 do onboarding (upload + preview de extracção em tempo real) requer exactamente as capacidades descritas na ficha **F03 — Upload de documentos + extração AI** (`FEATURES.md`): Supabase Storage, Edge Function com Vision LLM, tabela `documents`. Nenhuma destas peças está implementada. Decisão a tomar em `/plan`: (a) implementar uma versão mínima de upload+extracção como parte desta ficha de onboarding, aceitando alguma duplicação com F03 futura; ou (b) tratar F03 como dependência bloqueadora e implementá-la primeiro (mesmo que parcialmente) antes do onboarding poder ser concluído ponta-a-ponta. O ticket actual (`2026-09-11-onboarding.md`) já assinalava isto como risco em "Notas técnicas", mas não decide.
2. **`onboarding` não está registado no `Stack` de `app/_layout.tsx`.** Além de decidir a lógica de "primeira abertura" (ex: consultar `onboarding_completed` em `app/index.tsx` antes do redirect), é preciso decidir a estrutura de protecção: `onboarding` deve ficar dentro de um `Stack.Protected guard={!!session && !onboardingCompleted}` próprio, análogo ao padrão já usado para `(dashboard)`/`(auth)`.
3. **Schema:** confirmar se `onboarding_completed` fica em `public.users` (consistente com o padrão actual do projecto, ver secção Supabase acima) ou noutro sítio — e se esta migration fica a cargo desta ficha ou é tratada como setup separado (mesmo padrão de questão em aberto já registado no research de autenticação para a tabela `users`).
4. **Fontes Avenir/Lato continuam por carregar** (`expo-font` não instalado nem usado) — não é bloqueador funcional do onboarding, mas os três ecrãs (tal como todo o resto da app) vão renderizar com a fonte de sistema até isso ser resolvido; não está claro se deve ser resolvido nesta ficha ou tratado como tarefa de setup à parte (já assinalado como pendente no `CLAUDE.md`).
5. **Permissões `app.json`** para câmara/fototeca (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, equivalentes Android) têm de ser adicionadas — hoje inexistentes — sem isto o `expo-image-picker` falha em produção/builds EAS mesmo que funcione no Expo Go em desenvolvimento.
6. **Rules engine determinístico para o insight do Passo 3** (`src/lib/rulesEngine.ts`) não existe. O cálculo mais simples possível para um "Aha Moment" de onboarding (ex: dias até expiração de garantia, a partir de uma data extraída) ainda assim exige que este ficheiro seja criado — decidir em `/plan` se a versão criada aqui é já o rules engine completo (também usado por Coverage Check/Bills, fases posteriores) ou uma função mínima isolada só para este insight, a generalizar depois.
7. **Componente de progress indicator reutilizável** não existe — actualmente "1/3"/"2/3"/"3/3" é texto estático duplicado nos três ficheiros; decidir em `/plan` se se extrai para `src/components/ui/` ou `src/components/onboarding/` (nenhuma das duas pastas de domínio existe ainda para onboarding).
