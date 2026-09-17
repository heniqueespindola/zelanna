import { createClient } from 'npm:@supabase/supabase-js@2';

interface RequestBody {
  provider: string;
  actionType: 'cancel' | 'renegotiate';
  renewalDate: string;
  currentAmount: number | null;
}

const AGENT_DRAFT_SYSTEM_PROMPT = `You are drafting a short, polite, factual message for a user to send to a provider,
about their own contract. You will receive the provider name, the action requested
("cancel" or "renegotiate"), the renewal date and the current amount — never invent
any fact not given to you.
For "cancel": draft a cancellation request effective at or before the renewal date.
For "renegotiate": draft a message asking the provider to review the price given the
renewal date, without proposing a target price.
This is a DRAFT for the user to review and edit before sending themselves — never
address it as if already sent, never sign it with any name.
Respond with ONLY the message text in English. No JSON, no markdown, no subject line.`;

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const body: RequestBody = await req.json();

  const supabaseAuthed = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
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

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      system: AGENT_DRAFT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(body) }],
    }),
  });

  if (!anthropicResponse.ok) {
    return new Response(JSON.stringify({ error: 'Draft unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicResult = await anthropicResponse.json();
  const draft: string | undefined = anthropicResult?.content?.[0]?.text?.trim();

  if (!draft) {
    return new Response(JSON.stringify({ error: 'Draft unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ draft }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
