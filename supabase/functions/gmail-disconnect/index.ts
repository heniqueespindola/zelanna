import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';

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

  const { data: connection } = await supabaseService
    .from('gmail_connections')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (connection?.refresh_token) {
    const revokeResponse = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(connection.refresh_token)}`,
      { method: 'POST' }
    );
    if (!revokeResponse.ok) {
      console.error('Google token revoke error:', revokeResponse.status, await revokeResponse.text());
    }
  }

  const { error: updateError } = await supabaseService
    .from('gmail_connections')
    .update({
      status: 'revoked',
      access_token: null,
      refresh_token: null,
      revoked_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  if (updateError) {
    console.error('gmail_connections revoke update error:', updateError);
    return new Response(JSON.stringify({ error: 'Could not disconnect Gmail.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ connected: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
