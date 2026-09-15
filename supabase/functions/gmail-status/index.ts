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
    .select('google_email, status, last_synced_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const connected = connection?.status === 'active';

  return new Response(
    JSON.stringify({
      connected,
      googleEmail: connected ? connection?.google_email ?? null : null,
      lastSyncedAt: connection?.last_synced_at ?? null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
