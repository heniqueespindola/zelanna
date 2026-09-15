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
