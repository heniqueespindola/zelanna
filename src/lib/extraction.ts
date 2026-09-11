import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import type { UploadedDocument } from '@/types/documents';

interface UploadAndExtractParams {
  userId: string;
  uri: string;
  mimeType: string;
  base64?: string;
}

function filenameFromUri(uri: string): string {
  return uri.split('/').pop() ?? 'document';
}

export async function uploadAndExtractDocument({
  userId,
  uri,
  mimeType,
  base64,
}: UploadAndExtractParams): Promise<UploadedDocument> {
  const path = `${userId}/${Date.now()}-${filenameFromUri(uri)}`;

  const fileBody = base64 ? decode(base64) : await fetch(uri).then((res) => res.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, fileBody, { contentType: mimeType });

  if (uploadError) throw new Error('Upload failed');

  const { data, error: invokeError } = await supabase.functions.invoke<UploadedDocument>(
    'extract-document',
    { body: { documentPath: path, mimeType } }
  );

  if (invokeError || !data) throw new Error('Extraction failed');

  return data;
}
