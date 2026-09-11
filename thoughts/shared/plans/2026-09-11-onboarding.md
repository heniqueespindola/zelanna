---
data: 2026-09-11
feature: "Onboarding (3 ecrãs — objectivo, primeiro documento, primeiro insight)"
research: "thoughts/shared/research/2026-09-11-onboarding.md"
status: completo
---

# Spec: Onboarding (F02) + F03 mínimo (Upload + Extracção AI)

## Visão Geral

Implementa o fluxo de onboarding de 3 ecrãs (objectivo → upload → primeiro insight) e, como pré-requisito bloqueador, uma versão mínima de F03 (Storage, tabela `documents`, Edge Function de extracção Vision LLM com Claude) — o suficiente para o onboarding funcionar ponta-a-ponta sem duplicar o âmbito completo de F03 (sem UI de correcção de campos extraídos, que fica para a feature de biblioteca de documentos).

## Decisões tomadas (resolvendo "Questões em Aberto" do research)

| Questão | Decisão |
|---|---|
| F02 depende de F03 inexistente | F03 tratado como bloqueador — implementar versão mínima (Storage + tabela `documents` + Edge Function) nesta spec, sem UI de correcção de campos |
| Persistência de `onboarding_completed` | Coluna em `public.users` (consistente com o padrão já usado no projecto) |
| Rules engine | Estrutura completa e reutilizável desde já (`daysUntil`, `percentageChange`, `isExpiringSoon`, `isSignificantIncrease`, `isAnomaly`, `average`), antecipando Coverage Check (F04) e Bills Intelligence |
| Progress indicator | Extrair `src/components/onboarding/OnboardingProgress.tsx`, reutilizado pelos 3 ecrãs |
| Vision LLM | Claude (Anthropic Messages API), content block de imagem/PDF, chave em `ANTHROPIC_API_KEY` como secret da Edge Function |
| Retomar vs reiniciar onboarding interrompido | Reiniciar sempre no Passo 1 se `onboarding_completed = false` (decisão já assumida no ticket) — sem persistir progresso intermédio |
| Selecção de objectivos do Passo 1 | Persistida em `public.users.onboarding_goals` (para uso futuro), sem lógica condicional nos Passos 2/3 |
| Fontes Avenir/Lato (`expo-font`) | **Fora do âmbito desta spec** — já assinalado como pendência de setup separada no `CLAUDE.md`; ecrãs continuam a usar `fonts.display`/`fonts.body` como tokens, a resolver quando o setup de fontes for tratado |

---

## Fase 1 — Schema + Storage

### `supabase/schema.sql`
**Modificações:** adicionar, depois da definição actual de `public.users`:

```sql
alter table public.users
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_goals text[] not null default '{}';

create table if not exists public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  file_url text not null,
  document_type text,             -- 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt'
  provider text,
  date date,
  amount numeric,
  extracted_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);
```

### `supabase/storage.sql` (NOVO)
**Propósito:** bucket privado `documents` + políticas RLS de `storage.objects`, path convention `${user_id}/${timestamp}-${filename}` (primeiro segmento do path = `auth.uid()`).

```sql
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Users can upload to own folder"
  on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own folder"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own folder"
  on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
```

**Critérios de sucesso (manuais):**
- [x] `supabase db push` (ou execução manual no SQL editor) aplica ambos os ficheiros sem erro — confirmado indirectamente (upload + inserção em `documents` funcionou em dispositivo físico)
- [x] Bucket `documents` visível em Storage no dashboard Supabase, marcado como privado — confirmado indirectamente (upload funcionou)

---

## Fase 2 — Dependências + Permissões

### `package.json`
**Modificações:** correr `npx expo install expo-image-picker expo-document-picker expo-file-system base64-arraybuffer` (deixar o `expo install` resolver as versões compatíveis com SDK 57 — não fixar versões manualmente).

### `app.json`
**Modificações:**
- Em `expo.ios`, adicionar `infoPlist`:
```json
"infoPlist": {
  "NSPhotoLibraryUsageDescription": "Zelanna needs access to your photos to let you upload documents like invoices, warranties and insurance policies.",
  "NSCameraUsageDescription": "Zelanna needs access to your camera to let you photograph documents like invoices, warranties and insurance policies."
}
```
- Em `expo.plugins`, adicionar entrada de configuração do `expo-image-picker`:
```json
[
  "expo-image-picker",
  {
    "photosPermission": "Zelanna needs access to your photos to let you upload documents like invoices, warranties and insurance policies.",
    "cameraPermission": "Zelanna needs access to your camera to let you photograph documents like invoices, warranties and insurance policies."
  }
]
```

**Critérios de sucesso (automáticos):**
- [ ] `npx expo-doctor` continua a passar todos os checks — 1 falha pré-existente (drift de versões patch do Expo, já presente antes desta feature, não relacionada com os pacotes instalados nesta fase)

---

## Fase 3 — Edge Function `extract-document` (F03 mínimo)

### `supabase/functions/extract-document/index.ts` (NOVO)
**Propósito:** recebe o path de um documento já carregado no Storage, chama Claude (vision) para extrair campos estruturados, guarda o registo em `public.documents` e devolve o resultado ao cliente. Chave `ANTHROPIC_API_KEY` só existe aqui (secret da Edge Function via `supabase secrets set`), nunca no cliente.

**Input (body do `functions.invoke`):**
```ts
{ documentPath: string; mimeType: string } // documentPath = "${userId}/${filename}" dentro do bucket "documents"
```

**Lógica:**
1. Ler `Authorization` header (enviado automaticamente por `functions.invoke`); criar client Supabase com a env var `SUPABASE_URL`/`SUPABASE_ANON_KEY` passando esse header, para que `auth.uid()` funcione nas queries seguintes e o `user_id` inserido seja sempre o do chamador (nunca vindo do body).
2. Criar um segundo client com `SUPABASE_SERVICE_ROLE_KEY` (env var por omissão em Edge Functions) só para descarregar o ficheiro do bucket privado (`storage.from('documents').download(documentPath)`), já que o utilizador não tem acesso directo cross-service dentro da function.
3. Converter o ficheiro descarregado para base64.
4. Chamar `https://api.anthropic.com/v1/messages` com `x-api-key: ANTHROPIC_API_KEY`, modelo `claude-sonnet-5`, uma mensagem com content block de imagem (`type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 }`) ou documento (`type: 'document'` quando `mimeType === 'application/pdf'`), e um prompt de sistema que pede **apenas** JSON de saída com o schema:
   ```ts
   { document_type: 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt' | null,
     provider: string | null,
     date: string | null,        // ISO date
     amount: number | null,
     expiry_date: string | null } // ISO date — data de expiração/renovação, quando aplicável
   ```
5. Fazer `JSON.parse` defensivo da resposta (`try/catch`); em caso de falha, devolver `422` com mensagem amigável (`"Não foi possível interpretar este documento. Tenta outra foto ou ficheiro."`) sem inserir linha em `documents`.
6. Inserir em `public.documents` (usando o client autenticado do passo 1, para respeitar RLS): `user_id = auth.uid()`, `file_url = documentPath`, `document_type`, `provider`, `date`, `amount`, `extracted_data = { document_type, provider, date, amount, expiry_date }`.
7. Devolver `{ id, file_url, document_type, provider, date, amount, extracted_data, created_at }` (o registo inserido).

**Critérios de sucesso (manuais):**
- [x] `supabase functions deploy extract-document` sem erros — confirmado (função respondeu correctamente no dispositivo físico)
- [x] `supabase secrets set ANTHROPIC_API_KEY=...` configurado — confirmado (extracção via Claude funcionou)
- [x] Invocação real via app (upload de PDF) devolve JSON válido e cria linha em `documents` — confirmado

---

## Fase 4 — Tipos + Lib

### `src/types/documents.ts` (NOVO)
```ts
export type DocumentType = 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt';

export interface ExtractedDocumentData {
  document_type: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiry_date: string | null;
}

export interface UploadedDocument {
  id: string;
  file_url: string;
  document_type: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  extracted_data: ExtractedDocumentData;
  created_at: string;
}
```

### `src/lib/extraction.ts` (NOVO)
**Conteúdo:**
- `uploadAndExtractDocument(params: { userId: string; uri: string; mimeType: string; base64?: string }): Promise<UploadedDocument>`
  - Constrói `path = \`${userId}/${Date.now()}-${filenameFromUri(uri)}\``
  - Se `base64` fornecido (fotos do `expo-image-picker` com `base64: true`): `supabase.storage.from('documents').upload(path, decode(base64), { contentType: mimeType })` usando `decode` de `base64-arraybuffer`
  - Caso contrário (PDFs do `expo-document-picker`, sem base64 nativo): `fetch(uri)` → `.blob()` → `new Response(blob).arrayBuffer()` → `upload(path, arrayBuffer, { contentType: mimeType })`
  - Se `error` do upload, `throw new Error('Upload failed')`
  - `supabase.functions.invoke<UploadedDocument>('extract-document', { body: { documentPath: path, mimeType } })`
  - Se `error` do invoke ou `!data`, `throw new Error('Extraction failed')`
  - `return data`
- Função privada `filenameFromUri(uri: string): string`

### `src/lib/rulesEngine.ts` (NOVO)
**Conteúdo:** motor determinístico completo e reutilizável (Coverage Check e Bills Intelligence reutilizam estas funções em fases futuras — o LLM nunca calcula, só explica).

```ts
export function daysUntil(dateISO: string, from?: Date): number;
export function isExpiringSoon(dateISO: string, thresholdDays?: number): boolean; // default 30
export function percentageChange(current: number, previous: number): number;
export function isSignificantIncrease(current: number, previous: number, thresholdPercent?: number): boolean; // default 10 (>110%)
export function isAnomaly(current: number, average: number, thresholdPercent?: number): boolean; // default 25 (>125% da média)
export function average(values: number[]): number;

export type InsightSeverity = 'info' | 'warning' | 'critical';
export interface OnboardingInsight {
  headline: string;
  message: string;
  severity: InsightSeverity;
}
export function generateOnboardingInsight(doc: ExtractedDocumentData): OnboardingInsight;
```

**Lógica de `generateOnboardingInsight`:**
- Se `doc.expiry_date` presente: `days = daysUntil(doc.expiry_date)`
  - `days < 0` → `severity: 'critical'`, `message: "This expired {|days|} days ago."`
  - `isExpiringSoon(doc.expiry_date)` (≤30 dias) → `severity: 'warning'`, `message: "This expires in {days} days."`
  - caso contrário → `severity: 'info'`, `message: "This is valid until {expiry_date}."`
- Senão, se `doc.provider` presente → `severity: 'info'`, `message: "We've saved your {document_type} from {provider}. Upload more documents to unlock renewal alerts and coverage checks."`
- Fallback (sem dados suficientes) → `severity: 'info'`, `message: "We've saved your document. Upload more to start unlocking insights."`
- `headline` sempre `"Here's what we found"` (texto já usado no Passo 3 actual)

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa sem erros

---

## Fase 5 — Hook `useOnboarding`

### `src/hooks/useOnboarding.tsx` (NOVO)
**Propósito:** replica o padrão de `useAuth.tsx` (`AuthProvider` + `useContext`). Combina o estado persistido (`onboarding_completed`/`onboarding_goals` vindos de `public.users`) com o estado efémero do fluxo (objectivos seleccionados no Passo 1, documento carregado no Passo 2) — perdido ao fechar a app, por decisão (reiniciar sempre no Passo 1).

```tsx
type OnboardingContextValue = {
  onboardingCompleted: boolean | null; // null = ainda a carregar ou sem sessão
  loading: boolean;
  goals: string[];
  setGoals: (goals: string[]) => void;
  uploadedDocument: UploadedDocument | null;
  setUploadedDocument: (doc: UploadedDocument | null) => void;
  markCompleted: (goals: string[]) => Promise<void>;
};
```

**Lógica:**
- `useEffect` dependente de `session?.user.id` (via `useAuth()`): se houver sessão, `supabase.from('users').select('onboarding_completed').eq('id', session.user.id).single()` → `setOnboardingCompleted(data.onboarding_completed)`, `setLoading(false)`; se não houver sessão, `setOnboardingCompleted(null)`
- `markCompleted(goals)`: `await supabase.from('users').update({ onboarding_completed: true, onboarding_goals: goals }).eq('id', session.user.id)`, depois `setOnboardingCompleted(true)`
- `goals`/`uploadedDocument`: `useState` simples, sem persistência

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa sem erros

---

## Fase 6 — Componentes

### `src/components/onboarding/OnboardingProgress.tsx` (NOVO)
```tsx
interface Props { step: 1 | 2 | 3; }
export function OnboardingProgress({ step }: Props): JSX.Element; // renderiza `${step} / 3`, estilo idêntico ao `styles.step` actual (fontFamily fonts.body, color colors.surfaceAlt, textAlign center)
```

### `src/components/documents/DocumentUpload.tsx` (NOVO)
**Propósito:** botões de selecção (foto / biblioteca / PDF) + upload + extracção + preview inline read-only dos campos extraídos. Sem UI de correcção (fora do âmbito, ver Notas).

```tsx
interface Props {
  onExtracted: (doc: UploadedDocument) => void;
}
export function DocumentUpload({ onExtracted }: Props): JSX.Element;
```

**Estados internos:** `status: 'idle' | 'uploading' | 'extracting' | 'done' | 'error'`, `errorMessage: string | null`, `result: UploadedDocument | null`.

**Comportamento:**
- Três `Pressable`/`Button`: "Take photo" (`ImagePicker.launchCameraAsync({ base64: true })`), "Choose from library" (`ImagePicker.launchImageLibraryAsync({ base64: true })`), "Choose PDF" (`DocumentPicker.getDocumentAsync({ type: 'application/pdf' })`)
- Ao obter um asset: `setStatus('uploading')` → chamar `uploadAndExtractDocument` de `src/lib/extraction.ts` com `userId` de `useAuth()` → `setStatus('extracting')` implícito dentro da mesma promise (não há estado intermédio distinto do lado do cliente, a Edge Function já faz upload+extracção numa chamada lógica — ajustar UI para mostrar "Uploading & reading your document…" como texto único)
- Sucesso: `setStatus('done')`, `setResult(doc)`, chama `onExtracted(doc)`
- Erro (`catch`): `setStatus('error')`, `setErrorMessage('Something went wrong. Please try again.')`, mantém os botões visíveis para nova tentativa (sem perder o progresso do Passo 1, já que o erro não desmonta o `OnboardingProvider`)
- Quando `status === 'done'`: mostrar preview read-only (`provider`, `document_type`, `date`, `amount` do `result.extracted_data`)

**Critérios de sucesso (manuais):**
- [x] No simulador, seleccionar uma foto da biblioteca mostra "Uploading & reading your document…" e depois o preview dos campos extraídos — testado em dispositivo físico via upload de PDF, funcionou perfeitamente
- [ ] Forçar um erro (ex: desligar rede) mostra mensagem amigável e permite tentar de novo — não testado

---

## Fase 7 — Ecrãs de Onboarding

### `app/onboarding/step1.tsx`
**Modificações:**
- Importar `useOnboarding` de `@/hooks/useOnboarding` e `useRouter` de `expo-router`
- Substituir `<Text style={styles.step}>1 / 3</Text>` por `<OnboardingProgress step={1} />`
- Substituir o comentário `{/* TODO: F02 — multi-select do objetivo principal */}` por três opções `Pressable` (chips) para `'protect' | 'expenses' | 'estate'` com estado visual seleccionado/não seleccionado (usar `colors.primary` para seleccionado, `colors.border` para não seleccionado), multi-select (toggle no array `goals` local, sincronizado com `setGoals` do hook ao navegar)
- Botão "Continue": `disabled={selectedGoals.length === 0}`, `onPress={() => { setGoals(selectedGoals); router.push('/onboarding/step2'); }}` (usar componente `Button` de `@/components/ui/Button` em vez do `Pressable` cru actual, consistente com `(auth)/login.tsx`)

### `app/onboarding/step2.tsx`
**Modificações:**
- Importar `useOnboarding`, `useRouter`, `DocumentUpload` de `@/components/documents/DocumentUpload`
- Substituir indicador estático por `<OnboardingProgress step={2} />`
- Substituir `{/* TODO: F03 */}` por `<DocumentUpload onExtracted={(doc) => setUploadedDocument(doc)} />`
- Botão "Continue": `disabled={!uploadedDocument}`, `onPress={() => router.push('/onboarding/step3')}`

### `app/onboarding/step3.tsx`
**Modificações:**
- Importar `useOnboarding`, `useRouter`, `generateOnboardingInsight` de `@/lib/rulesEngine`
- Substituir indicador estático por `<OnboardingProgress step={3} />`
- Calcular `const insight = uploadedDocument ? generateOnboardingInsight(uploadedDocument.extracted_data) : null` (fallback se `uploadedDocument` for `null` — não deveria acontecer dado o guard do Passo 2, mas evita crash: mostrar mensagem genérica "Upload a document to see your first insight.")
- Substituir o texto hardcoded do `subtitle` pelo `insight.message`; usar `colors.accent` (`#C9A15C`) na badge/headline (já usado em `styles.badge`, manter)
- Cor do texto do `subtitle` variar por `insight.severity`? **Não** — manter `colors.surfaceAlt` para o corpo do texto (severidade visual fica só na badge dourada, consistente com o tom "nunca alarmista" do `CLAUDE.md`)
- Botão "Go to dashboard": `onPress={async () => { await markCompleted(goals); router.replace('/(dashboard)'); }}`

**Critérios de sucesso (manuais):**
- [x] Fluxo completo Passo 1 → 2 → 3 → Dashboard funciona em dispositivo físico com um documento real (PDF)
- [x] Insight apresentado no Passo 3 reflecte os dados extraídos do documento carregado (não hardcoded)
- [x] Reabrir a app depois de completar onboarding vai directo para `(dashboard)`, sem passar por onboarding

---

## Fase 8 — Routing

### `app/_layout.tsx`
**Modificações:**
- Importar `OnboardingProvider, useOnboarding` de `@/hooks/useOnboarding`
- Envolver `<SplashScreenController /><RootNavigator />` também com `<OnboardingProvider>` (dentro de `<AuthProvider>`, já que depende de `session`)
- `RootNavigator`: ler `const { onboardingCompleted } = useOnboarding()` além de `session`; actualizar os `Stack.Protected`:
```tsx
<Stack.Protected guard={!!session && onboardingCompleted === true}>
  <Stack.Screen name="(dashboard)" />
</Stack.Protected>
<Stack.Protected guard={!!session && onboardingCompleted === false}>
  <Stack.Screen name="onboarding" />
</Stack.Protected>
<Stack.Protected guard={!session}>
  <Stack.Screen name="(auth)" />
</Stack.Protected>
```
- `SplashScreenController`: esconder o splash só quando `!authLoading && (!!session ? !onboardingLoading : true)` (evita flash de ecrã errado enquanto `onboarding_completed` ainda está a ser consultado)

### `app/index.tsx`
**Modificações:**
```tsx
export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { onboardingCompleted, loading: onboardingLoading } = useOnboarding();

  if (authLoading || (session && onboardingLoading)) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <Redirect href={onboardingCompleted ? '/(dashboard)' : '/onboarding/step1'} />;
}
```

**Critérios de sucesso (automáticos):**
- [x] `tsc --noEmit` passa sem erros
- [ ] `expo lint` passa sem warnings — 4 erros pré-existentes de `react/no-unescaped-entities` mantêm-se (não relacionados com esta feature, fora do âmbito desta spec)

**Critérios de sucesso (manuais):**
- [x] Novo utilizador: após login, vai para `onboarding/step1` (não para dashboard) — confirmado (foi assim que se detectou e corrigiu o bug de routing do `app/onboarding/_layout.tsx`)
- [x] Utilizador com `onboarding_completed = true`: login vai directo para `(dashboard)` — confirmado ao reabrir a app após completar onboarding
- [ ] Sem sessão: vai para `(auth)/login` — não testado nesta sessão

---

## Estratégia de Testes

- **Unit (manual, sem test runner configurado no projecto ainda):** validar `daysUntil`, `isExpiringSoon`, `percentageChange`, `isSignificantIncrease`, `isAnomaly` e `generateOnboardingInsight` com valores de fronteira (expiry no passado, exactamente 30 dias, sem `expiry_date`) — correr via `ts-node` ou script isolado, já que não há Jest configurado
- **Manual (simulador iOS/Android via Expo Go ou dev build):**
  1. Registar novo utilizador → confirmar redirect automático para `onboarding/step1`
  2. Passo 1: tentar avançar sem seleccionar objectivo (botão deve estar desactivado); seleccionar um ou mais; avançar
  3. Passo 2: carregar uma foto real de factura/garantia; validar mensagem de progresso e depois preview dos campos extraídos; testar também o caminho PDF
  4. Passo 2 (erro): desligar a rede a meio do upload, confirmar mensagem amigável e possibilidade de tentar de novo
  5. Passo 3: confirmar que o insight reflecte o documento carregado (não é o texto hardcoded antigo)
  6. Concluir onboarding → confirmar chegada ao dashboard e `onboarding_completed = true` na tabela `users` (via Supabase dashboard)
  7. Fechar e reabrir a app → confirmar que vai directo para o dashboard, sem repetir onboarding

---

## Notas de Implementação

- **Separação cálculo/explicação:** `rulesEngine.ts` é sempre determinístico — nenhuma chamada a LLM dentro deste ficheiro. A Edge Function só usa o LLM para **extrair** campos do documento, nunca para calcular datas/percentagens.
- **Sem UI de correcção de campos extraídos nesta spec** — decisão explícita para manter o âmbito mínimo (F03 completo, com ecrã de confirmação/edição, fica para a feature dedicada de biblioteca de documentos). Se a extracção vier claramente errada, o único recurso do utilizador nesta versão é carregar outro documento.
- **Quota/custo do Vision LLM:** cada tentativa de upload no Passo 2 custa uma chamada à API Anthropic — não há limite de tentativas implementado nesta spec (aceitável para onboarding de um único documento; a revisitar se abuso for observado).
- **RLS:** a Edge Function nunca insere `user_id` vindo do body do pedido — usa sempre `auth.uid()` do client autenticado pelo JWT do chamador, para impedir que um utilizador escreva documentos em nome de outro.
- **Fontes Avenir/Lato:** fora do âmbito, ver tabela de decisões acima.
- **Objectivos do Passo 1 sem lógica condicional:** `onboarding_goals` fica guardado em `public.users` só para uso futuro (ex: priorizar cards no dashboard); nenhum ecrã desta spec lê este valor de volta.
- **Documento do onboarding na biblioteca geral:** por ser inserido normalmente em `public.documents`, fica automaticamente visível em `(dashboard)/documents.tsx` quando essa feature for implementada — nenhuma acção adicional necessária nesta spec.

## Referências

- Research: `thoughts/shared/research/2026-09-11-onboarding.md`
- Ticket: `thoughts/shared/tickets/2026-09-11-onboarding.md`
- Padrão de hook de contexto a replicar: `src/hooks/useAuth.tsx`
- Padrão de guard de rotas a estender: `app/_layout.tsx:19-24`
- Padrão de tema dos ecrãs de onboarding: `app/onboarding/step1.tsx:25-63`
