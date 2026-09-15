import { createClient } from 'npm:@supabase/supabase-js@2';

interface RequestBody {
  serverAuthCode: string;
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const { serverAuthCode }: RequestBody = await req.json();

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

  // serverAuthCode vem do SDK nativo Google Sign-In (não de um redirect_uri) —
  // Google exige redirect_uri='' quando a app não tem uma contraparte web
  // (ver https://developers.google.com/identity/sign-in/ios/offline-access).
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: Deno.env.get('GMAIL_CLIENT_ID')!,
      client_secret: Deno.env.get('GMAIL_CLIENT_SECRET')!,
      redirect_uri: '',
      code: serverAuthCode,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error('Google token exchange error:', tokenResponse.status, errorBody);
    return new Response(
      JSON.stringify({ error: 'Could not connect Gmail.', detail: errorBody }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tokenResult = await tokenResponse.json();
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, scope } = tokenResult;

  if (!accessToken || !refreshToken) {
    console.error('Google token exchange missing tokens:', JSON.stringify(tokenResult));
    return new Response(
      JSON.stringify({ error: 'Could not connect Gmail.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoResponse.ok) {
    const errorBody = await userInfoResponse.text();
    console.error('Google userinfo error:', userInfoResponse.status, errorBody);
    return new Response(
      JSON.stringify({ error: 'Could not connect Gmail.', detail: errorBody }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const userInfo = await userInfoResponse.json();
  const googleEmail: string | undefined = userInfo?.email;

  if (!googleEmail) {
    return new Response(
      JSON.stringify({ error: 'Could not connect Gmail.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error: upsertError } = await supabaseService
    .from('gmail_connections')
    .upsert(
      {
        user_id: user.id,
        google_email: googleEmail,
        access_token: accessToken,
        refresh_token: refreshToken,
        scope,
        token_expires_at: tokenExpiresAt,
        status: 'active',
        connected_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    console.error('gmail_connections upsert error:', upsertError);
    return new Response(
      JSON.stringify({ error: 'Could not connect Gmail.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ connected: true, googleEmail }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
