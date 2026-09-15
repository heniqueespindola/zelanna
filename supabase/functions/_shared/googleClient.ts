export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresAt: string }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Could not refresh Google access token: ${response.status} ${errorBody}`);
  }

  const result = await response.json();
  const expiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
  return { accessToken: result.access_token, expiresAt };
}

export async function listCandidateMessageIds(
  accessToken: string,
  query: string,
  maxResults: number
): Promise<string[]> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gmail messages.list failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return (data.messages ?? []).map((m: { id: string }) => m.id);
}

export interface GmailAttachmentRef {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
}

const ATTACHMENT_FILENAME_PATTERN = /\.(pdf|jpe?g|png)$/i;

interface GmailMessagePart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string };
  parts?: GmailMessagePart[];
}

function collectAttachmentParts(part: GmailMessagePart, out: GmailMessagePart[]): void {
  if (part.body?.attachmentId && part.filename && ATTACHMENT_FILENAME_PATTERN.test(part.filename)) {
    out.push(part);
  }
  for (const child of part.parts ?? []) {
    collectAttachmentParts(child, out);
  }
}

export async function listAttachmentRefs(accessToken: string, messageId: string): Promise<GmailAttachmentRef[]> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gmail messages.get failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const parts: GmailMessagePart[] = [];
  if (data.payload) collectAttachmentParts(data.payload, parts);

  return parts.map((part) => ({
    messageId,
    attachmentId: part.body!.attachmentId!,
    filename: part.filename!,
    mimeType: part.mimeType ?? 'application/octet-stream',
  }));
}

function base64UrlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gmail attachments.get failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return base64UrlToBytes(data.data);
}
