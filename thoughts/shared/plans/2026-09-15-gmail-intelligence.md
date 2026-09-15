---
data: 2026-09-15
feature: "Gmail Intelligence — Find my bills (F09)"
research: "thoughts/shared/research/2026-09-15-gmail-intelligence.md"
status: verificado_ios_pendente_android
---

# Spec: Gmail Intelligence — "Find my bills" (F09)

## ⚠️ Nota de gate (metodologia)

`CLAUDE.md` lista explicitamente "Gmail antes da validação" em `## Não construir ainda`, e a Phase 0 (validação manual) continua por fazer. Esta spec foi gerada a pedido explícito do founder, confirmado durante `/plan`, com a decisão de operar inicialmente em **Google Cloud Console modo "Testing" (≤100 utilizadores de teste, sem submissão a CASA)** — compatível com early beta / Phase 0 informal, não com lançamento público. Não avançar para verificação/CASA sem decisão de negócio separada.

## Visão Geral

Liga uma conta Gmail por utilizador (OAuth "Web application", troca de código sempre em Edge Function), pesquisa periodicamente (`pg_cron` → Edge Function) por emails com anexos de faturas usando um `q` dirigido, extrai os anexos candidatos reutilizando a pipeline Vision LLM já existente, e apresenta-os numa fila de revisão no ecrã Documents que reutiliza **sem alterações** o `DocumentPreviewForm` já usado no upload manual — nunca grava documento/bill sem confirmação humana.

## ⚠️ Nota de correção pós-implementação (2026-09-15)

Durante a verificação manual descobriu-se que o fluxo OAuth original desta spec (`expo-auth-session` + redirect `zelanna://` para um cliente OAuth "Web application") **não funciona** — a Google deixou de aceitar custom URI schemes como `redirect_uri`, tanto para iOS como para Android, independentemente do tipo de cliente OAuth. Isto invalida a linha "Fluxo OAuth" e a spec Fase 2 tal como escritas abaixo.

**Correcção aplicada** (decisão confirmada com o founder): substituir `expo-auth-session` por `@react-native-google-signin/google-signin` (SDK nativo — deixa de funcionar em Expo Go, exige dev client/EAS build), usando o padrão `offlineAccess`/`serverAuthCode`. O `serverAuthCode` é trocado no `gmail-connect` com `redirect_uri=''` (sem redirect real — ver https://developers.google.com/identity/sign-in/ios/offline-access), mantendo o resto da arquitectura (client_secret sempre em Edge Function, nunca no cliente) inalterado. Continua a ser necessário o cliente OAuth "Web application" (agora como `webClientId`/`GMAIL_CLIENT_ID` para o SDK nativo), mais um cliente "iOS" novo (`iosClientId`, sem secret) — ver `.env.example` e `app.json` (`iosUrlScheme`) para os valores exactos a preencher na Google Cloud Console.

**Verificado em iOS (dev client, simulador) em 2026-09-15:** connect → Gmail API precisou de ser activada manualmente no Google Cloud Console (`gmail.googleapis.com`) — não estava activada por omissão, apesar do cliente OAuth já existir; sem isto `gmail-sync` falhava silenciosamente (`accessNotConfigured`, capturado e ignorado pelo `try/catch` por-ligação, por isso não abortava a função mas também não criava candidatos). Depois de activada: connect, sync (via botão manual, ver nota abaixo), fila de revisão e confirmação testados com sucesso.

**Adição não prevista na spec original: botão "Sync now".** A spec original só previa `gmail-sync` invocado pelo `pg_cron` (sem JWT de utilizador). Durante a verificação percebeu-se que não havia forma de o utilizador (ou de testar) despoletar uma pesquisa imediata — só esperar pelo cron horário. Adicionado: `gmail-sync` agora aceita opcionalmente uma sessão de utilizador autenticado (`auth.getUser()` sobre o `Authorization` recebido); se resolver um `user.id`, restringe o processamento só à ligação desse utilizador (nunca todas), preservando a garantia "nunca despoletar sync da conta de outro utilizador". Chamada do `pg_cron` com a `service_role` key continua a processar todas as ligações activas, sem alteração. UI: botão "Sync now" em `GmailImportQueue.tsx`, sempre visível quando `connected=true` (independente de haver itens pendentes).

## Decisões tomadas em `/plan`

| Questão | Decisão |
|---|---|
| CASA/verificação | Modo "Testing" (≤100 utilizadores), sem submissão CASA por agora |
| Tipo de cliente OAuth | "Web application" — troca de código sempre em Edge Function, `GMAIL_CLIENT_SECRET` nunca no cliente |
| Tokens Gmail | Tabela `gmail_connections` com RLS activo e **zero policies** para `anon`/`authenticated` — só legível por Edge Functions via `service_role` |
| Fluxo OAuth | ~~`expo-auth-session` totalmente à parte do login do Zelanna (não `supabase.auth.linkIdentity`)~~ — **substituído**, ver nota de correcção acima: `@react-native-google-signin/google-signin` com `offlineAccess`/`serverAuthCode`, também à parte do login do Zelanna |
| Revisão humana | Sempre via `DocumentPreviewForm` — sem caminho de gravação automática |
| Deduplicação | Duas camadas: (1) registo `gmail_message_id`+`gmail_attachment_id` (evita reprocessar/re-chamar Vision LLM); (2) comparação de conteúdo (`provider_normalized`+`invoice_date`+`amount` contra `bills` existentes) antes de expor o candidato à revisão — protege contra o mesmo documento entrar por upload manual e por Gmail. Decisão tomada nesta fase porque o research já recomendava "provavelmente são precisas as duas"; ver `## Notas de Implementação` |
| Execução periódica | `pg_cron`/Supabase Cron → HTTP POST a uma nova Edge Function (`gmail-sync`), não n8n |
| Onde processar | Edge Functions (consistente com `extract-document`/`explain-insight`), não n8n |

## Ficheiros a Criar

### `supabase/functions/_shared/extraction.ts`
**Propósito:** extrai a lógica Vision LLM de `extract-document/index.ts` para um módulo partilhado, reutilizável por `gmail-sync` (que precisa de extrair anexos sem passar por um pedido HTTP autenticado por utilizador). Sem isto, a lógica de extracção ficaria duplicada entre as duas Edge Functions — violaria o critério de aceitação "sem duplicar lógica de extracção".
**Conteúdo:**
```ts
// mesmo EXTRACTION_SYSTEM_PROMPT, stripMarkdownFences, arrayBufferToBase64
// hoje em supabase/functions/extract-document/index.ts:17-42

export interface ExtractedDocumentData { /* idêntico ao actual */ }

export type ExtractionOutcome =
  | { ok: true; data: ExtractedDocumentData }
  | { ok: false; status: number; error: string; detail?: string; rawText?: string };

export async function extractDocumentData(base64: string, mimeType: string): Promise<ExtractionOutcome> {
  // corpo = chamada ao Anthropic + parsing, exactamente a lógica hoje em
  // extract-document/index.ts:83-133, mas devolvendo ExtractionOutcome em vez
  // de um Response — quem chama decide o que fazer com o erro.
}
```

### `supabase/functions/_shared/googleClient.ts`
**Propósito:** cliente mínimo para a Gmail API, usado só por `gmail-sync`. Mantido isolado (não referenciado por nenhum outro ficheiro) para que adicionar Outlook no futuro não implique tocar em `gmail-sync`/schema — só trocar este módulo, conforme `CLAUDE.md`/ticket ("Gmail primeiro, Outlook depois", sem abstração multi-provider prematura).
**Conteúdo:**
```ts
export async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string):
  Promise<{ accessToken: string; expiresAt: string }>;
  // POST https://oauth2.googleapis.com/token, grant_type=refresh_token

export async function listCandidateMessageIds(accessToken: string, query: string, maxResults: number):
  Promise<string[]>;
  // GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=<query>&maxResults=<n>
  // devolve data.messages?.map(m => m.id) ?? []

export interface GmailAttachmentRef {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
}

export async function listAttachmentRefs(accessToken: string, messageId: string):
  Promise<GmailAttachmentRef[]>;
  // GET .../messages/{messageId}?format=full
  // percorre recursivamente payload.parts; inclui parts com body.attachmentId
  // e filename a terminar em .pdf/.jpg/.jpeg/.png (case-insensitive)

export async function downloadAttachment(accessToken: string, messageId: string, attachmentId: string):
  Promise<Uint8Array>;
  // GET .../messages/{messageId}/attachments/{attachmentId}
  // resposta vem em base64url (data.data) — converter para bytes (Gmail usa
  // '-'/'_' em vez de '+'/'/'; normalizar antes de atob/decode)
```

### `supabase/functions/gmail-connect/index.ts`
**Propósito:** troca o `code` OAuth devolvido pelo `expo-auth-session` no cliente por `access_token`/`refresh_token`, sempre do lado do servidor (`GMAIL_CLIENT_SECRET` nunca sai daqui). Grava/actualiza `gmail_connections`.
**Conteúdo:**
- Autenticação idêntica ao padrão de `explain-insight/index.ts:58-77` (client anon key + `Authorization` header → `auth.getUser()`).
- Body esperado: `{ code: string; redirectUri: string }`.
- `POST https://oauth2.googleapis.com/token` com `grant_type=authorization_code`, `client_id=GMAIL_CLIENT_ID`, `client_secret=GMAIL_CLIENT_SECRET`, `redirect_uri`, `code`.
- `GET https://www.googleapis.com/oauth2/v3/userinfo` com o `access_token` recebido, para obter `email`.
- `upsert` em `gmail_connections` (client `service_role`) com `onConflict: 'user_id'`: `google_email`, `access_token`, `refresh_token`, `scope`, `token_expires_at = now() + expires_in`, `status: 'active'`, `connected_at: now()`, `revoked_at: null`.
- Responde `{ connected: true, googleEmail }` (200) ou erro (400/502) se a troca falhar.

### `supabase/functions/gmail-disconnect/index.ts`
**Propósito:** revoga o acesso na Google e limpa os tokens localmente. Sem isto, o critério de aceitação "utilizador consegue desligar a ligação" não é cumprido.
**Conteúdo:**
- Mesma autenticação.
- Lê `refresh_token` de `gmail_connections` (via `service_role`) para o `user.id`.
- Se existir, `POST https://oauth2.googleapis.com/revoke?token=<refresh_token>`.
- `update` em `gmail_connections`: `status: 'revoked'`, `access_token: null`, `refresh_token: null`, `revoked_at: now()`.
- Responde `{ connected: false }`.

### `supabase/functions/gmail-status/index.ts`
**Propósito:** único caminho pelo qual o cliente sabe se o Gmail está ligado — a tabela `gmail_connections` não tem policy de `select` para `authenticated`, por isso o app não pode ler `connected`/`google_email` directamente via `supabase.from(...)`.
**Conteúdo:**
- Mesma autenticação.
- `select google_email, status, last_synced_at` de `gmail_connections` via `service_role`, `eq('user_id', user.id)`, `.maybeSingle()`.
- Responde `{ connected: boolean, googleEmail: string | null, lastSyncedAt: string | null }` — nunca inclui tokens.

### `supabase/functions/gmail-sync/index.ts`
**Propósito:** função invocada pelo `pg_cron` (não por um utilizador) que percorre todas as ligações activas, pesquisa a Gmail com um `q` dirigido, extrai anexos candidatos e grava-os em `gmail_import_items` para revisão. **Nunca chama `saveDocument`/`saveBill` directamente** — só prepara candidatos, consistente com a decisão "sempre revisão humana".
**Conteúdo:**
```ts
const GMAIL_SEARCH_QUERY = [
  'has:attachment',
  '(filename:pdf OR filename:jpg OR filename:jpeg OR filename:png)',
  '(subject:(fatura OR factura OR invoice OR recibo OR receipt OR "your bill" OR "sua fatura" OR seguro OR insurance OR apólice OR renovação OR renewal) OR from:(noreply OR faturacao OR billing OR facturacao))',
  'newer_than:180d',
].join(' ');
const MAX_MESSAGES_PER_SYNC = 20;

Deno.serve(async (req) => {
  // 1. cliente service_role (esta função nunca recebe JWT de utilizador —
  //    é invocada pelo pg_cron com o service_role key; confiar no
  //    verify_jwt por omissão das Edge Functions, que aceita qualquer JWT
  //    válido assinado pelo projecto, incluindo o service_role key)
  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: connections } = await supabaseService
    .from('gmail_connections')
    .select('user_id, access_token, refresh_token, token_expires_at')
    .eq('status', 'active');

  for (const connection of connections ?? []) {
    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) <= new Date(Date.now() + 60_000)) {
      const refreshed = await refreshAccessToken(connection.refresh_token, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
      accessToken = refreshed.accessToken;
      await supabaseService.from('gmail_connections')
        .update({ access_token: refreshed.accessToken, token_expires_at: refreshed.expiresAt })
        .eq('user_id', connection.user_id);
    }

    const messageIds = await listCandidateMessageIds(accessToken, GMAIL_SEARCH_QUERY, MAX_MESSAGES_PER_SYNC);

    for (const messageId of messageIds) {
      const attachments = await listAttachmentRefs(accessToken, messageId);
      for (const attachment of attachments) {
        // camada 1 de dedup: unique(user_id, gmail_message_id, gmail_attachment_id)
        // — tentar insert "reservando" a linha antes de gastar quota/Vision LLM;
        // em conflito (23505), significa já processado — continue.
        const { error: reserveError } = await supabaseService
          .from('gmail_import_items')
          .insert({
            user_id: connection.user_id,
            gmail_message_id: messageId,
            gmail_attachment_id: attachment.attachmentId,
            mime_type: attachment.mimeType,
            status: 'processing',
          });
        if (reserveError) continue; // já existe (unique violation) — skip

        const bytes = await downloadAttachment(accessToken, messageId, attachment.attachmentId);
        const path = `${connection.user_id}/gmail-${Date.now()}-${attachment.filename}`;
        await supabaseService.storage.from('documents').upload(path, bytes, { contentType: attachment.mimeType });

        const base64 = /* bytes -> base64 standard, para extractDocumentData */;
        const outcome = await extractDocumentData(base64, attachment.mimeType);

        if (!outcome.ok) {
          await supabaseService.storage.from('documents').remove([path]);
          await supabaseService.from('gmail_import_items')
            .update({ status: 'failed', document_path: null })
            .eq('user_id', connection.user_id).eq('gmail_message_id', messageId).eq('gmail_attachment_id', attachment.attachmentId);
          continue;
        }

        // camada 2 de dedup: conteúdo já existe em `bills`?
        const extracted = outcome.data;
        let isDuplicateContent = false;
        if (extracted.provider && extracted.date && extracted.amount !== null) {
          const { data: existingBill } = await supabaseService
            .from('bills')
            .select('id')
            .eq('user_id', connection.user_id)
            .eq('provider_normalized', extracted.provider.trim().toLowerCase())
            .eq('invoice_date', extracted.date)
            .eq('amount', extracted.amount)
            .maybeSingle();
          isDuplicateContent = existingBill !== null;
        }

        if (isDuplicateContent) {
          await supabaseService.storage.from('documents').remove([path]);
          await supabaseService.from('gmail_import_items')
            .update({ status: 'duplicate_content', document_path: null, extracted_data: extracted })
            .eq('user_id', connection.user_id).eq('gmail_message_id', messageId).eq('gmail_attachment_id', attachment.attachmentId);
        } else {
          await supabaseService.from('gmail_import_items')
            .update({ status: 'pending_review', document_path: path, extracted_data: extracted })
            .eq('user_id', connection.user_id).eq('gmail_message_id', messageId).eq('gmail_attachment_id', attachment.attachmentId);
        }
      }
    }

    await supabaseService.from('gmail_connections').update({ last_synced_at: new Date().toISOString() }).eq('user_id', connection.user_id);
  }

  return new Response(JSON.stringify({ ok: true, connectionsProcessed: (connections ?? []).length }), { status: 200 });
});
```
Nota: o `status: 'processing'` inicial (antes de `document_path`/`extracted_data` existirem) serve para a linha "reservar" a chave única de dedup atomically antes de gastar quota Gmail/Vision LLM — se a função falhar a meio, a próxima corrida do cron não repete o trabalho para esse par mensagem/anexo (fica em `processing`/`failed`, nunca reprocessado automaticamente; um retry manual exigiria apagar a linha, fora do escopo desta spec).

### `supabase/cron.sql`
**Propósito:** documenta o job `pg_cron` a criar — **não commitar a `service_role` key literal neste ficheiro**. Este SQL é uma referência para configurar via Supabase Studio → Database → Cron (que gere o secret do header internamente) ou via SQL editor substituindo os placeholders manualmente, nunca via migration automática.
**Conteúdo:**
```sql
-- Executar manualmente no SQL editor do Supabase Studio (não em CI/deploy automático).
-- Substituir <PROJECT_REF> e configurar o header Authorization via Supabase Vault
-- (Studio → Cron UI trata isto automaticamente ao criar o job pela interface).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'gmail-sync-hourly',
  '0 * * * *',  -- de hora a hora; ajustar depois de validar quota/custo real
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/gmail-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### `src/types/gmail.ts`
**Propósito:** tipos partilhados pelo cliente para o estado da ligação Gmail e para os itens da fila de revisão.
**Conteúdo:**
```ts
import type { ExtractedDocumentData } from '@/types/documents';

export interface GmailConnectionStatus {
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
}

export type GmailImportItemStatus =
  | 'pending_review' | 'imported' | 'skipped' | 'duplicate_content' | 'failed' | 'processing';

export interface GmailImportItem {
  id: string;
  gmail_message_id: string;
  document_path: string | null;
  mime_type: string | null;
  extracted_data: ExtractedDocumentData | null;
  status: GmailImportItemStatus;
  created_at: string;
}
```

### `src/lib/gmailAuth.ts`
**Propósito:** funções client-side para ligar/desligar/consultar o estado do Gmail, chamando as três Edge Functions novas. Sem lógica de UI.
**Conteúdo:**
```ts
export async function fetchGmailStatus(): Promise<GmailConnectionStatus> {
  const { data, error } = await supabase.functions.invoke<GmailConnectionStatus>('gmail-status');
  if (error || !data) throw new Error('Could not load Gmail connection status');
  return data;
}

export async function exchangeGmailCode(code: string, redirectUri: string): Promise<GmailConnectionStatus> {
  const { data, error } = await supabase.functions.invoke<{ connected: boolean; googleEmail: string }>(
    'gmail-connect', { body: { code, redirectUri } }
  );
  if (error || !data) throw new Error('Could not connect Gmail');
  return { connected: data.connected, googleEmail: data.googleEmail, lastSyncedAt: null };
}

export async function disconnectGmail(): Promise<void> {
  const { error } = await supabase.functions.invoke('gmail-disconnect');
  if (error) throw new Error('Could not disconnect Gmail');
}
```

### `src/hooks/useGmailConnection.tsx`
**Propósito:** encapsula `AuthSession.useAuthRequest` (Google, `responseType: Code`, `scopes: ['https://www.googleapis.com/auth/gmail.readonly']`, `extraParams: { access_type: 'offline', prompt: 'consent' }` — `prompt: 'consent'` é necessário para a Google reemitir sempre um `refresh_token`, não só na primeira autorização) + estado de status (`fetchGmailStatus` no mount) + acções `connect`/`disconnect`.
**Conteúdo:**
```ts
export function useGmailConnection() {
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'zelanna' });
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_GMAIL_CLIENT_ID!,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    discovery
  );

  const refreshStatus = async () => { setStatus(await fetchGmailStatus()); };

  useEffect(() => { refreshStatus().finally(() => setLoading(false)); }, []);

  useEffect(() => {
    if (response?.type === 'success' && response.params.code) {
      setConnecting(true);
      exchangeGmailCode(response.params.code, redirectUri)
        .then(refreshStatus)
        .finally(() => setConnecting(false));
    }
  }, [response]);

  const connect = () => promptAsync();
  const disconnect = async () => { await disconnectGmail(); await refreshStatus(); };

  return { status, loading, connecting, connect, disconnect, requestReady: !!request };
}
```

### `src/components/settings/GmailConnectionCard.tsx`
**Propósito:** UI em Settings para ligar/desligar o Gmail — ponto de entrada pedido pelo comportamento esperado do ticket ("Documents ou um novo ponto de entrada equivalente"); Settings foi escolhido por ser onde já vivem outras integrações de conta (padrão de `app/(dashboard)/settings.tsx`, que hoje só tem "Log out").
**Conteúdo:**
- Usa `useGmailConnection()`.
- Se `loading`: `ActivityIndicator`.
- Se `status.connected`: mostra `Connected as {googleEmail}` + "Last synced: {lastSyncedAt ou 'never'}" + `<Button title="Disconnect Gmail" onPress={disconnect} />`.
- Se não ligado: texto curto a explicar o scope pedido (consistente com o consentimento — "Zelanna will search Gmail for bills and receipts using your permission. It never reads your inbox freely.") + `<Button title="Connect Gmail" onPress={connect} disabled={!requestReady} loading={connecting} />`.
- Segue o padrão visual de `Card`/estilos de `DocumentPreviewForm.tsx:174-194` (fundo `colors.primary`, `radius.md`, `spacing.md`).

### `src/lib/gmailImports.ts`
**Propósito:** leitura/actualização da fila de revisão pelo cliente (a única parte de `gmail_import_items` a que o cliente tem acesso, via RLS `auth.uid() = user_id`).
**Conteúdo:**
```ts
export async function fetchPendingGmailImportItems(userId: string): Promise<GmailImportItem[]> {
  const { data, error } = await supabase
    .from('gmail_import_items')
    .select('id, gmail_message_id, document_path, mime_type, extracted_data, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load Gmail import queue');
  return data ?? [];
}

export async function markGmailImportItemReviewed(params: {
  itemId: string;
  status: 'imported' | 'skipped';
  documentId?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('gmail_import_items')
    .update({
      status: params.status,
      document_id: params.documentId ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.itemId);
  if (error) throw new Error('Could not update Gmail import item');
}
```

### `src/components/documents/GmailImportQueue.tsx`
**Propósito:** lista os candidatos `pending_review` no ecrã Documents; ao seleccionar um, reutiliza **sem alterações** `DocumentPreviewForm`, passando `documentPath`/`extracted` vindos da linha de `gmail_import_items` em vez de um upload acabado de fazer. Este é o componente que fecha o critério de aceitação "reutiliza `DocumentPreviewForm` tal como está".
**Conteúdo:**
```tsx
export function GmailImportQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<GmailImportItem[]>([]);
  const [selected, setSelected] = useState<GmailImportItem | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setItems(await fetchPendingGmailImportItems(user.id));
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const handleSaved = async (doc: UploadedDocument) => {
    if (!selected) return;
    await markGmailImportItemReviewed({ itemId: selected.id, status: 'imported', documentId: doc.id });
    setSelected(null);
    load();
  };

  const handleCancelled = async () => {
    if (!selected) return;
    // discardDocument(documentPath) já é chamado dentro do próprio DocumentPreviewForm.handleCancel
    await markGmailImportItemReviewed({ itemId: selected.id, status: 'skipped' });
    setSelected(null);
    load();
  };

  if (loading || items.length === 0) return null;

  if (selected && user) {
    return (
      <DocumentPreviewForm
        userId={user.id}
        documentPath={selected.document_path!}
        extracted={selected.extracted_data!}
        onSaved={handleSaved}
        onCancelled={handleCancelled}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Found via Gmail ({items.length})</Text>
      {items.map((item) => (
        <Pressable key={item.id} style={styles.card} onPress={() => setSelected(item)}>
          <Text style={styles.cardText}>
            {item.extracted_data?.provider ?? 'Unknown provider'} — {item.extracted_data?.amount !== null && item.extracted_data?.amount !== undefined ? `€${item.extracted_data.amount}` : '—'}
          </Text>
          <Text style={styles.cardSubtext}>{item.extracted_data?.date ?? '—'}</Text>
        </Pressable>
      ))}
    </View>
  );
}
```
Estilos a seguir o padrão de `DocumentUpload.tsx:123-157` (`colors.white`/`colors.black` para cards sobre fundo `bgDarkest`).

## Ficheiros a Modificar

### `supabase/functions/extract-document/index.ts`
**Modificações:**
- [ ] Substituir `EXTRACTION_SYSTEM_PROMPT`, `stripMarkdownFences`, `arrayBufferToBase64` e o bloco de chamada Anthropic (linhas 17-42 e 88-133) por um import de `../_shared/extraction.ts`: `import { extractDocumentData, type ExtractedDocumentData } from '../_shared/extraction.ts';`
- [ ] Handler passa a: obter `base64` (linha 81, inalterado) → `const outcome = await extractDocumentData(base64, mimeType);` → se `!outcome.ok`, devolver `new Response(JSON.stringify({ error: outcome.error, ...outcome }), { status: outcome.status, ... })`; se `ok`, devolver `new Response(JSON.stringify(outcome.data), { status: 200, ... })`.
- [ ] Manter inalterado: autenticação (linhas 44-68), download do Storage (linhas 70-79), `contentBlock` (linhas 83-86) — estes continuam específicos deste handler (recebem `documentPath`/fazem download; `gmail-sync` já tem os bytes e não passa por aqui).
- [ ] Comportamento HTTP observável (status codes 401/400/502/422/200, formato do body) deve permanecer **idêntico** ao actual — este é um refactor puro, não uma mudança de contrato.

### `supabase/schema.sql`
**Modificações:**
- [ ] Adicionar no final do ficheiro (depois de `public.events`, linha 282):
```sql
create table if not exists public.gmail_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade unique,
  google_email text not null,
  access_token text not null,
  refresh_token text not null,
  scope text not null,
  token_expires_at timestamptz not null,
  last_synced_at timestamptz,
  status text not null default 'active',   -- 'active' | 'revoked'
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS activo e SEM policies para anon/authenticated: só o service_role
-- (usado dentro das Edge Functions gmail-connect/disconnect/status/sync)
-- pode ler ou escrever tokens. O cliente nunca lê esta tabela directamente
-- (ver gmail-status/index.ts) — decisão tomada em /plan, CLAUDE.md > Segurança > least privilege.
alter table public.gmail_connections enable row level security;

create table if not exists public.gmail_import_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  gmail_message_id text not null,
  gmail_attachment_id text not null,
  document_path text,
  mime_type text,
  extracted_data jsonb,
  status text not null default 'processing',  -- 'processing' | 'pending_review' | 'imported' | 'skipped' | 'duplicate_content' | 'failed'
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint gmail_import_items_message_attachment_unique unique (user_id, gmail_message_id, gmail_attachment_id)
);

alter table public.gmail_import_items enable row level security;

create index if not exists gmail_import_items_user_status_idx
  on public.gmail_import_items (user_id, status);

-- Cliente só vê/actualiza os seus próprios itens (para reveer e marcar
-- imported/skipped); nunca insere (só gmail-sync insere, via service_role).
create policy "Users can view own gmail import items"
  on public.gmail_import_items for select
  using (auth.uid() = user_id);

create policy "Users can update own gmail import items"
  on public.gmail_import_items for update
  using (auth.uid() = user_id);
```

### `app/(dashboard)/settings.tsx`
**Modificações:**
- [ ] Adicionar import: `import { GmailConnectionCard } from '@/components/settings/GmailConnectionCard';`
- [ ] Renderizar `<GmailConnectionCard />` entre o `subtitle` e o `Button title="Log out"` (substitui o comentário `{/* TODO: perfil, plano (Stripe), privacidade */}` mantendo o resto do TODO para perfil/plano, que fica fora do escopo desta feature).

### `app/(dashboard)/documents.tsx`
**Modificações:**
- [ ] Adicionar import: `import { GmailImportQueue } from '@/components/documents/GmailImportQueue';`
- [ ] Renderizar `<GmailImportQueue />` antes de `<DocumentUpload onExtracted={() => {}} />`, para os candidatos por rever aparecerem no topo do ecrã.

### `package.json`
**Modificações:**
- [ ] Adicionar dependências via `npx expo install expo-auth-session expo-web-browser` (garante versões compatíveis com Expo SDK 57 — não fixar versões manualmente).

### `.env.example`
**Modificações:**
- [ ] Secção cliente: adicionar `EXPO_PUBLIC_GMAIL_CLIENT_ID=` (client ID OAuth Google não é secreto — necessário no cliente para `AuthSession.useAuthRequest`).
- [ ] Secção servidor: descomentar/confirmar `GMAIL_CLIENT_SECRET=` e adicionar `GMAIL_CLIENT_ID=` (a Edge Function `gmail-connect`/`gmail-sync` também precisa do `client_id` para a troca de tokens) — configurar como Supabase Edge Function secrets (`supabase secrets set`), nunca como `EXPO_PUBLIC_*`.

## Fases de Implementação

### Fase 1: Schema + refactor de extracção partilhada
**Ficheiros:**
- Criar `supabase/functions/_shared/extraction.ts`
- Modificar `supabase/functions/extract-document/index.ts`
- Modificar `supabase/schema.sql`

**Critérios de sucesso (automáticos):**
- [ ] `npm run typecheck` (`tsc --noEmit`) continua a passar (não toca em código RN, mas confirma que nada quebrou)
- [ ] `supabase/schema.sql` aplica sem erros num projecto Supabase novo/existente (`supabase db push` ou correr no SQL editor)

**Critérios de sucesso (manuais):**
- [ ] Upload manual de um documento (fluxo já existente) continua a extrair e gravar exactamente como antes — regressão zero no F03/F06
- [ ] `select * from gmail_connections; select * from gmail_import_items;` correm sem erro (tabelas vazias)

### Fase 2: OAuth connect/disconnect/status + UI em Settings
**Ficheiros:**
- Criar `supabase/functions/gmail-connect/index.ts`, `supabase/functions/gmail-disconnect/index.ts`, `supabase/functions/gmail-status/index.ts`
- Criar `src/types/gmail.ts`, `src/lib/gmailAuth.ts`, `src/hooks/useGmailConnection.tsx`, `src/components/settings/GmailConnectionCard.tsx`
- Modificar `app/(dashboard)/settings.tsx`, `package.json`, `.env.example`

**Pré-requisito manual (fora do código):** criar projecto no Google Cloud Console → OAuth consent screen em modo "Testing" (adicionar o email do founder e de cada tester como "test user") → criar credencial OAuth 2.0 "Web application" com `https://www.googleapis.com/auth/gmail.readonly` pedido no consent screen e o redirect URI gerado por `AuthSession.makeRedirectUri({ scheme: 'zelanna' })` registado nos "Authorized redirect URIs".

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` sem erros
- [ ] `expo lint` sem warnings

**Critérios de sucesso (manuais):**
- [ ] Em Settings, "Connect Gmail" abre o ecrã de consentimento Google pedindo apenas `gmail.readonly`
- [ ] Depois de autorizar, Settings mostra "Connected as {email}" e `select * from gmail_connections` mostra a linha com tokens preenchidos
- [ ] "Disconnect Gmail" faz Settings voltar a "Connect Gmail" e a linha em `gmail_connections` fica `status='revoked'`, `access_token`/`refresh_token` a `null`
- [ ] Confirmar directamente no Supabase que `supabase.from('gmail_connections').select()` a partir do cliente autenticado devolve **vazio/erro de permissão** (RLS sem policy activa)

### Fase 3: Pesquisa, extracção e staging (`gmail-sync` + `pg_cron`)
**Ficheiros:**
- Criar `supabase/functions/_shared/googleClient.ts`, `supabase/functions/gmail-sync/index.ts`, `supabase/cron.sql`

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` sem erros (ficheiros Deno não são cobertos por este comando, mas não devem quebrar a compilação do resto do projecto)

**Critérios de sucesso (manuais):**
- [ ] Com uma conta Gmail de teste ligada (Fase 2) e pelo menos um email real com anexo de fatura na caixa de correio, invocar manualmente `supabase functions invoke gmail-sync` (usando a service role key) e confirmar: aparece uma linha nova em `gmail_import_items` com `status='pending_review'` e `extracted_data` preenchido
- [ ] Invocar `gmail-sync` uma segunda vez sem novos emails: nenhuma linha duplicada é criada (a `unique constraint` + o insert de reserva impedem reprocessamento)
- [ ] Criar manualmente um `bill` com o mesmo `provider`/`invoice_date`/`amount` de um email de teste, correr `gmail-sync`: o item correspondente fica `status='duplicate_content'`, não `pending_review`
- [ ] Confirmar que a query Gmail usada (`GMAIL_SEARCH_QUERY`) nunca é chamada sem `q` — inspeccionar o pedido feito a `messages.list` (log/breakpoint) e confirmar que o parâmetro `q` está sempre presente e não vazio

### Fase 4: Fila de revisão no ecrã Documents
**Ficheiros:**
- Criar `src/lib/gmailImports.ts`, `src/components/documents/GmailImportQueue.tsx`
- Modificar `app/(dashboard)/documents.tsx`

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` sem erros
- [ ] `expo lint` sem warnings

**Critérios de sucesso (manuais):**
- [ ] Com pelo menos um item `pending_review` em `gmail_import_items` (da Fase 3), o ecrã Documents mostra "Found via Gmail (1)" com um card resumindo fornecedor/valor/data
- [ ] Tocar no card abre `DocumentPreviewForm` pré-preenchido com os mesmos dados extraídos (sem nova chamada ao Vision LLM)
- [ ] Confirmar o formulário: documento e bill são gravados (`documents`, `bills`), insights gerados (`insights`) exactamente como no upload manual; o item em `gmail_import_items` passa a `status='imported'` com `document_id` preenchido; o card desaparece da fila
- [ ] Repetir com "Cancel" em vez de confirmar: o ficheiro é removido do Storage (`discardDocument`, já dentro de `DocumentPreviewForm.handleCancel`), o item fica `status='skipped'`, o card desaparece da fila

## Estratégia de Testes

- **Unit:** nenhuma lógica nova de cálculo determinístico é introduzida nesta feature (o motor de regras já existente — `rulesEngine.ts`/`insights.ts` — é reutilizado sem alteração), por isso não há novos casos de `rulesEngine.test` a escrever. Se houver testes unitários a adicionar, focar em `_shared/extraction.ts` (`extractDocumentData` devolve `ExtractionOutcome` correcto para respostas Anthropic válidas/malformadas) e em `listAttachmentRefs` (percorre `payload.parts` aninhados correctamente, filtra por extensão).
- **Manual:** ver critérios de sucesso manuais por fase acima — cobrem o ciclo completo (connect → sync → review → save/discard → disconnect) com uma conta Gmail de teste real em modo "Testing".

## Notas de Implementação

- **Duas camadas de dedup, não uma.** A camada 1 (`gmail_message_id`+`gmail_attachment_id`) é barata e evita reprocessar o mesmo anexo em corridas repetidas do cron (poupa quota Gmail e chamadas Vision LLM). A camada 2 (conteúdo: `provider_normalized`+`invoice_date`+`amount` contra `bills`) é a única protecção contra o mesmo documento entrar por dois canais — upload manual **e** Gmail — porque a camada 1 só reconhece o mesmo `attachment_id` do Gmail, não um PDF equivalente carregado manualmente antes. Sem a camada 2, um utilizador que já tenha carregado manualmente uma fatura veria o mesmo documento reaparecer na fila Gmail.
- **`status: 'processing'` como reserva atómica.** O insert inicial em `gmail_import_items` (antes de extrair) serve para "reclamar" a chave única antes de gastar tempo/quota — evita que duas corridas concorrentes do cron processem o mesmo anexo em paralelo. Um item preso em `processing` (por falha a meio) não é reprocessado automaticamente nesta spec; um mecanismo de retry/limpeza fica fora de escopo (adicionar só se se mostrar necessário na prática).
- **`gmail_connections` sem nenhuma policy de SELECT/INSERT/UPDATE para `authenticated`/`anon` é intencional**, não um esquecimento — é a implementação directa da decisão "tokens só legíveis por Edge Functions via `service_role`". Isto significa que **qualquer** acesso a esta tabela a partir do cliente (mesmo `select count(*)`) deve passar por uma Edge Function; não adicionar policies "só para debugging" mais tarde sem repetir esta decisão conscientemente.
- **`prompt: 'consent'` no pedido OAuth** é obrigatório — sem isto, a Google só devolve `refresh_token` na primeira autorização de sempre para aquele `client_id`+utilizador; num fluxo de reconexão (depois de desligar e voltar a ligar), sem `prompt: 'consent'` o segundo `code` trocado não viria com `refresh_token`, partindo silenciosamente o `gmail-sync` (token expira e nunca mais é renovado).
- **`gmail-sync` nunca é invocado com um JWT de utilizador** — confia no comportamento por omissão das Edge Functions do Supabase (`verify_jwt=true`), que aceita qualquer JWT assinado pelo segredo do projecto, incluindo a `service_role` key usada pelo `pg_cron`. Não adicionar lógica de `auth.getUser()` nesta função — não há utilizador autenticado neste contexto, só o `service_role`.
- **`supabase/cron.sql` não deve ser aplicado via migration automática** — o job depende de o segredo (`service_role` key ou, preferencialmente, uma referência via Supabase Vault) estar configurado na Dashboard. Documentar isto claramente para quem for aplicar (ver comentário no próprio ficheiro).
- **Quota Gmail:** `messages.list` custa 5 unidades, `messages.get`/`attachments.get` mais; com `MAX_MESSAGES_PER_SYNC = 20` e um cron horário por utilizador, mesmo com dezenas de testers em modo "Testing" o consumo fica muito abaixo do limite de 15.000 unidades/minuto por utilizador — não é um risco nesta fase (research já confirmou isto).
- **Base64url vs base64.** A Gmail API devolve bytes de anexos em base64url (`-`/`_` em vez de `+`/`/`, sem padding `=`). `downloadAttachment` em `googleClient.ts` deve normalizar para base64 padrão antes de `extractDocumentData` (que espera o mesmo formato já usado por `extract-document`, vindo de `arrayBufferToBase64`).
- **`extract-document/index.ts` é um refactor puro nesta spec** — não alterar o schema de extracção, os campos devolvidos, nem os status codes. Qualquer mudança de comportamento aqui seria uma regressão no F03/F06 já em produção.

## Referências

- Research: `thoughts/shared/research/2026-09-15-gmail-intelligence.md`
- Ticket: `thoughts/shared/tickets/2026-09-15-gmail-intelligence.md`
- Padrão "upload → extract → save → insight" a reutilizar sem alteração: `src/components/documents/DocumentPreviewForm.tsx:37-115`, `src/components/documents/DocumentUpload.tsx:25-40`
- Padrão de autenticação de Edge Function a replicar: `supabase/functions/explain-insight/index.ts:58-77`
- Lógica de extracção a mover para `_shared/extraction.ts`: `supabase/functions/extract-document/index.ts:17-42,83-133`
- Padrão de normalização de fornecedor reutilizado no dedup de conteúdo: `src/lib/contracts.ts:8-10`
- Padrão de coluna gerada `provider_normalized` reutilizado para o dedup de conteúdo: `supabase/schema.sql:148,210`
- Motor de insights reutilizado sem alteração: `src/lib/insights.ts:171-282`
