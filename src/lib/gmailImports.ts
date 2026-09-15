import { supabase } from '@/lib/supabase';
import type { GmailImportItem } from '@/types/gmail';

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

export async function triggerGmailSync(): Promise<void> {
  const { error } = await supabase.functions.invoke('gmail-sync');
  if (error) throw new Error('Could not check Gmail for new bills');
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
