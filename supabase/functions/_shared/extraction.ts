export interface ExtractedDocumentData {
  document_type: 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt' | null;
  provider: string | null;
  date: string | null;
  amount: number | null;
  expiry_date: string | null;
  category: 'water' | 'electricity' | 'gas' | 'internet' | 'mobile' | 'landline' | 'insurance' | null;
}

export type ExtractionOutcome =
  | { ok: true; data: ExtractedDocumentData }
  | { ok: false; status: number; error: string; detail?: string; rawText?: string };

const EXTRACTION_SYSTEM_PROMPT = `You are a document data extractor for a personal life administration app.
You will be given an image or PDF of a document such as an invoice, warranty, insurance policy, contract or receipt.
Extract the following fields and respond with ONLY a JSON object, no prose, no markdown fences:
{
  "document_type": "invoice" | "warranty" | "insurance" | "contract" | "receipt" | null,
  "provider": string | null,
  "date": string | null,
  "amount": number | null,
  "expiry_date": string | null,
  "category": "water" | "electricity" | "gas" | "internet" | "mobile" | "landline" | "insurance" | null
}
Use ISO 8601 (YYYY-MM-DD) for "date" and "expiry_date". "expiry_date" is the expiration or renewal date, when applicable (e.g. warranty end date, insurance renewal date). "category" only applies when the document is a recurring utility/insurance bill (invoice or insurance document_type); classify it into exactly one of the categories above based on the provider/content, or null if it doesn't match any or you're not confident. Never guess. Use null for any field you cannot determine with confidence.`;

function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1] : text;
}

export async function extractDocumentData(base64: string, mimeType: string): Promise<ExtractionOutcome> {
  const contentBlock =
    mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };

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
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [contentBlock, { type: 'text', text: 'Extract the fields from this document.' }],
        },
      ],
    }),
  });

  if (!anthropicResponse.ok) {
    const errorBody = await anthropicResponse.text();
    console.error('Anthropic API error:', anthropicResponse.status, errorBody);
    return {
      ok: false,
      status: 502,
      error: 'Document extraction service is unavailable.',
      detail: errorBody,
    };
  }

  const anthropicResult = await anthropicResponse.json();
  const rawText: string | undefined = anthropicResult?.content?.[0]?.text;

  try {
    if (!rawText) throw new Error('Empty response');
    const extracted: ExtractedDocumentData = JSON.parse(stripMarkdownFences(rawText));
    return { ok: true, data: extracted };
  } catch (parseError) {
    console.error('Could not parse Claude response as JSON:', parseError, 'raw text:', rawText, 'full result:', JSON.stringify(anthropicResult));
    return {
      ok: false,
      status: 422,
      error: 'Não foi possível interpretar este documento. Tenta outra foto ou ficheiro.',
      rawText,
    };
  }
}
