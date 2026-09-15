import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractDocumentData } from '../_shared/extraction.ts';
import {
  refreshAccessToken,
  listCandidateMessageIds,
  listAttachmentRefs,
  downloadAttachment,
} from '../_shared/googleClient.ts';

const GMAIL_SEARCH_QUERY = [
  'has:attachment',
  '(filename:pdf OR filename:jpg OR filename:jpeg OR filename:png)',
  '(subject:(fatura OR factura OR invoice OR recibo OR receipt OR "your bill" OR "sua fatura" OR seguro OR insurance OR apólice OR renovação OR renewal) OR from:(noreply OR faturacao OR billing OR facturacao))',
  'newer_than:180d',
].join(' ');
const MAX_MESSAGES_PER_SYNC = 20;

const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  const supabaseService = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Chamada do pg_cron usa a service_role key como Authorization — auth.getUser()
  // não resolve um utilizador para essa key, por isso scopedUserId fica null e
  // processamos todas as ligações activas. Uma chamada feita pela app (via
  // supabase.functions.invoke, botão "Sync now") envia a sessão do utilizador —
  // auth.getUser() resolve um user.id real, e restringimos a essa ligação apenas,
  // para um utilizador nunca poder despoletar sync da conta Gmail de outro.
  let scopedUserId: string | null = null;
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader) {
    const supabaseAuthed = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseAuthed.auth.getUser();
    if (user) scopedUserId = user.id;
  }

  let connectionsQuery = supabaseService
    .from('gmail_connections')
    .select('user_id, access_token, refresh_token, token_expires_at')
    .eq('status', 'active');
  if (scopedUserId) {
    connectionsQuery = connectionsQuery.eq('user_id', scopedUserId);
  }
  const { data: connections } = await connectionsQuery;

  for (const connection of connections ?? []) {
    if (!connection.access_token || !connection.refresh_token) continue;

    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) <= new Date(Date.now() + 60_000)) {
      try {
        const refreshed = await refreshAccessToken(connection.refresh_token, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
        accessToken = refreshed.accessToken;
        await supabaseService
          .from('gmail_connections')
          .update({ access_token: refreshed.accessToken, token_expires_at: refreshed.expiresAt })
          .eq('user_id', connection.user_id);
      } catch (refreshError) {
        console.error('Could not refresh access token for user', connection.user_id, refreshError);
        continue;
      }
    }

    let messageIds: string[];
    try {
      messageIds = await listCandidateMessageIds(accessToken, GMAIL_SEARCH_QUERY, MAX_MESSAGES_PER_SYNC);
    } catch (searchError) {
      console.error('Gmail search failed for user', connection.user_id, searchError);
      continue;
    }

    for (const messageId of messageIds) {
      let attachments;
      try {
        attachments = await listAttachmentRefs(accessToken, messageId);
      } catch (listError) {
        console.error('Could not list attachments for message', messageId, listError);
        continue;
      }

      for (const attachment of attachments) {
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

        let bytes: Uint8Array;
        let path: string;
        try {
          bytes = await downloadAttachment(accessToken, messageId, attachment.attachmentId);
          path = `${connection.user_id}/gmail-${Date.now()}-${attachment.filename}`;
          await supabaseService.storage.from('documents').upload(path, bytes, { contentType: attachment.mimeType });
        } catch (downloadError) {
          console.error('Could not download/upload attachment', messageId, attachment.attachmentId, downloadError);
          await supabaseService
            .from('gmail_import_items')
            .update({ status: 'failed' })
            .eq('user_id', connection.user_id)
            .eq('gmail_message_id', messageId)
            .eq('gmail_attachment_id', attachment.attachmentId);
          continue;
        }

        const base64 = bytesToBase64(bytes);
        const outcome = await extractDocumentData(base64, attachment.mimeType);

        if (!outcome.ok) {
          await supabaseService.storage.from('documents').remove([path]);
          await supabaseService
            .from('gmail_import_items')
            .update({ status: 'failed', document_path: null })
            .eq('user_id', connection.user_id)
            .eq('gmail_message_id', messageId)
            .eq('gmail_attachment_id', attachment.attachmentId);
          continue;
        }

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
          await supabaseService
            .from('gmail_import_items')
            .update({ status: 'duplicate_content', document_path: null, extracted_data: extracted })
            .eq('user_id', connection.user_id)
            .eq('gmail_message_id', messageId)
            .eq('gmail_attachment_id', attachment.attachmentId);
        } else {
          await supabaseService
            .from('gmail_import_items')
            .update({ status: 'pending_review', document_path: path, extracted_data: extracted })
            .eq('user_id', connection.user_id)
            .eq('gmail_message_id', messageId)
            .eq('gmail_attachment_id', attachment.attachmentId);
        }
      }
    }

    await supabaseService
      .from('gmail_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', connection.user_id);
  }

  return new Response(JSON.stringify({ ok: true, connectionsProcessed: (connections ?? []).length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
