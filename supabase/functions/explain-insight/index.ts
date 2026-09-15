import { createClient } from 'npm:@supabase/supabase-js@2';

interface PriceIncreaseBody {
  type: 'price_increase';
  provider: string;
  previousAmount: number;
  currentAmount: number;
  changeAmount: number;
  changePercent: number;
}

interface RenewalBody {
  type: 'renewal';
  provider: string;
  renewalDate: string;
  daysUntilRenewal: number;
}

type RequestBody = PriceIncreaseBody | RenewalBody;

const EXPLAIN_SYSTEM_PROMPT = `You are writing a short, factual, calm notification for a personal life administration app.
You will receive numbers that were already calculated by a deterministic rules engine — never recalculate or invent any number.
Respond with ONLY one short sentence in English, no JSON, no markdown, no prose before or after.
For "price_increase": state the provider and the percentage increase, using the exact numbers given.
For "renewal": state the provider and how many days until renewal, using the exact numbers given.
Tone: clear, calm, trustworthy, never alarmist — but direct and actionable.`;

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
      max_tokens: 256,
      system: EXPLAIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(body) }],
    }),
  });

  if (!anthropicResponse.ok) {
    return new Response(JSON.stringify({ error: 'Explanation unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropicResult = await anthropicResponse.json();
  const message: string | undefined = anthropicResult?.content?.[0]?.text?.trim();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Explanation unavailable.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
