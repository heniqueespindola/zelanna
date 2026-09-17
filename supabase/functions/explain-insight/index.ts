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

interface AnomalyBody {
  type: 'anomaly';
  provider: string;
  category: string | null;
  currentAmount: number;
  averageAmount: number;
  deviationAmount: number;
  deviationPercent: number;
  periodMonths: number;
}

interface RecurringIncreaseBody {
  type: 'recurring_increase';
  provider: string;
  category: string | null;
  monthsConsecutive: number;
  amounts: number[];
}

interface CoverageGapBody {
  type: 'coverage_gap';
  assetName: string;
  coverageType: 'warranty' | 'insurance';
  reason: 'missing' | 'expired';
  endDate: string | null;
}

interface CoverageExpiringBody {
  type: 'coverage_expiring';
  assetName: string;
  coverageType: 'warranty' | 'insurance' | 'extension';
  provider: string | null;
  endDate: string;
  daysUntilExpiry: number;
}

interface ReturnDeadlineBody {
  type: 'return_deadline';
  assetName: string;
  returnDeadline: string;
  daysUntilDeadline: number;
}

interface UnusedSubscriptionBody {
  type: 'unused_subscription';
  provider: string;
  monthsSinceLastDocument: number;
  thresholdMonths: number;
}

interface DuplicateInsuranceBody {
  type: 'duplicate_insurance';
  assetName: string;
  providers: (string | null)[];
  count: number;
}

interface MissingDocumentationBody {
  type: 'missing_documentation';
  subjectType: 'asset' | 'contract';
  subjectName: string;
}

interface ProtectionGapBody {
  type: 'protection_gap';
  assetName: string;
  purchasePrice: number;
  thresholdValue: number;
}

type RequestBody =
  | PriceIncreaseBody
  | RenewalBody
  | AnomalyBody
  | RecurringIncreaseBody
  | CoverageGapBody
  | CoverageExpiringBody
  | ReturnDeadlineBody
  | UnusedSubscriptionBody
  | DuplicateInsuranceBody
  | MissingDocumentationBody
  | ProtectionGapBody;

const EXPLAIN_SYSTEM_PROMPT = `You are writing a short, factual, calm notification for a personal life administration app.
You will receive numbers that were already calculated by a deterministic rules engine — never recalculate or invent any number.
Respond with ONLY one short sentence in English, no JSON, no markdown, no prose before or after.
For "price_increase": state the provider and the percentage increase, using the exact numbers given.
For "renewal": state the provider and how many days until renewal, using the exact numbers given.
For "anomaly": state the provider (and category, if given) and how much the current amount is above the average for the period, using the exact numbers given.
For "recurring_increase": state the provider (and category, if given) and that the price has increased for the given number of consecutive billing periods, using the exact number given.
For "coverage_gap": state the asset name, whether the warranty or insurance is missing or expired, and the date if given, using the exact information given.
For "coverage_expiring": state the asset name, the coverage type (warranty, insurance or extension) and how many days until it expires, using the exact numbers given.
For "return_deadline": state the asset name and how many days remain to return it, using the exact numbers given.
For "unused_subscription": state the provider and that no invoice has been uploaded in over the given number of months, suggesting the subscription may be unused — never state this as certain.
For "duplicate_insurance": state the asset name and that more than one active insurance policy was found on it, using the exact count given.
For "missing_documentation": state the subject name and that no document is on file for it (an asset or a contract, per subjectType).
For "protection_gap": state the asset name and that it has no active coverage despite being above the given value threshold, using the exact numbers given.
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
