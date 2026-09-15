import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import type { DocumentType, ExtractedDocumentData, ExtractionResult, UploadedDocument } from '@/types/documents';

function filenameFromUri(uri: string): string {
  return uri.split('/').pop() ?? 'document';
}

export async function uploadDocument(params: {
  userId: string;
  uri: string;
  mimeType: string;
  base64?: string;
}): Promise<{ documentPath: string }> {
  const path = `${params.userId}/${Date.now()}-${filenameFromUri(params.uri)}`;
  const fileBody = params.base64
    ? decode(params.base64)
    : await fetch(params.uri).then((res) => res.arrayBuffer());

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, fileBody, { contentType: params.mimeType });
  if (error) throw new Error('Upload failed');

  return { documentPath: path };
}

export async function extractDocument(params: {
  documentPath: string;
  mimeType: string;
}): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke<ExtractedDocumentData>(
    'extract-document',
    { body: params }
  );
  if (error || !data) throw new Error('Extraction failed');
  return { documentPath: params.documentPath, mimeType: params.mimeType, extracted: data };
}

export async function saveDocument(params: {
  userId: string;
  documentPath: string;
  documentType: DocumentType | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiryDate: string | null;
  extracted: ExtractedDocumentData;
}): Promise<UploadedDocument> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: params.userId,
      file_url: params.documentPath,
      document_type: params.documentType,
      provider: params.provider,
      date: params.date,
      amount: params.amount,
      expiry_date: params.expiryDate,
      extracted_data: params.extracted,
    })
    .select()
    .single();

  if (error || !data) throw new Error('Save failed');
  return data;
}

export async function discardDocument(documentPath: string): Promise<void> {
  await supabase.storage.from('documents').remove([documentPath]);
}
