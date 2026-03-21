import { timingSafeEqual, createHmac } from 'node:crypto';

/**
 * Validate Twilio webhook signature (HMAC-SHA1).
 * Uses the public-facing URL since behind a reverse proxy request.url may differ.
 */
export function validateTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
  authToken: string | undefined
): boolean {
  if (!signature || !authToken) return false;

  // Build the data string: URL + sorted params concatenated
  const sortedKeys = Object.keys(params).sort((a, b) => a.localeCompare(b));
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = createHmac('sha1', authToken).update(data).digest('base64');

  const sigBuf = Buffer.from(signature, 'base64');
  const expBuf = Buffer.from(expected, 'base64');
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}
