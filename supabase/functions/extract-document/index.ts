import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractDocumentData } from '../_shared/extraction.ts';

interface RequestBody {
  documentPath: string;
  mimeType: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const { documentPath, mimeType }: RequestBody = await req.json();

  const supabaseAuthed = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const supabaseService = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const {
    data: { user },
  } = await supabaseAuthed.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: fileData, error: downloadError } = await supabaseService.storage
    .from('documents')
    .download(documentPath);

  if (downloadError || !fileData) {
    return new Response(JSON.stringify({ error: 'Could not read uploaded file.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const base64 = arrayBufferToBase64(await fileData.arrayBuffer());

  const outcome = await extractDocumentData(base64, mimeType);

  if (!outcome.ok) {
    return new Response(
      JSON.stringify({ ...outcome, error: outcome.error }),
      { status: outcome.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify(outcome.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
