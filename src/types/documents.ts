export type DocumentType = 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt';

export interface ExtractedDocumentData {
  document_type: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiry_date: string | null;
}

export interface ExtractionResult {
  documentPath: string;
  mimeType: string;
  extracted: ExtractedDocumentData;
}

export interface UploadedDocument {
  id: string;
  asset_id: string | null;
  file_url: string;
  document_type: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiry_date: string | null;
  extracted_data: ExtractedDocumentData;
  created_at: string;
}
