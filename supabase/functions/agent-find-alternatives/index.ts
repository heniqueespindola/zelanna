import { createClient } from 'npm:@supabase/supabase-js@2';

interface RequestBody {
  provider: string;
  type: 'insurance' | 'utility' | 'subscription' | 'other';
  currentAmount: number | null;
}

const AGENT_ALTERNATIVES_SYSTEM_PROMPT = `You are researching alternative providers for a personal life administration app.
You have access to web search. Find up to 5 well-known providers in Portugal that
offer a comparable {type} product to the one described, as potential cheaper
alternatives to {provider}.
Never state a specific price as fact — you cannot verify current pricing. Each
"note" must be phrased as an unverified suggestion (e.g. "often cited as competitive
on price", never "costs €X").
Respond with ONLY a JSON object: {"alternatives": [{"providerName": "...", "note": "..."}]}.
No markdown, no prose outside the JSON.`;

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
      max_tokens: 1024,
      system: AGENT_ALTERNATIVES_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(body) }],
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
    }),
  });

  if (!anthropicResponse.ok) {
    return new Response(JSON.stringify({ error: 'Alternatives unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicResult = await anthropicResponse.json();
  const textBlocks: string[] =
    anthropicResult?.content?.filter((block: { type: string }) => block.type === 'text').map((block: { text: string }) => block.text) ?? [];
  const finalText = textBlocks[textBlocks.length - 1]?.trim();

  let parsed: { alternatives?: unknown } | null = null;
  try {
    parsed = finalText ? JSON.parse(finalText) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || !Array.isArray(parsed.alternatives)) {
    return new Response(JSON.stringify({ error: 'Alternatives unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ alternatives: parsed.alternatives }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
