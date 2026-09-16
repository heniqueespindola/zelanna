import type { BillCategory } from '@/types/bills';

export type DocumentType = 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt' | 'will' | 'certificate';

export interface ExtractedDocumentData {
  document_type: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiry_date: string | null;
  category: BillCategory | null;
}

export interface ExtractionResult {
  documentPath: string;
  mimeType: string;
  extracted: ExtractedDocumentData;
}

export interface UploadedDocument {
  id: string;
  asset_id: string | null;
  contract_id: string | null;
  bill_id: string | null;
  file_url: string;
  document_type: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiry_date: string | null;
  extracted_data: ExtractedDocumentData;
  is_estate_document: boolean;
  created_at: string;
}
