import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateTwilioSignature } from '../../src/lib/twilio.js';

const AUTH_TOKEN = 'test-auth-token-abc123';
const WEBHOOK_URL = 'https://example.com/webhooks/whatsapp';

function computeSignature(url: string, params: Record<string, string>, token: string): string {
  const sortedKeys = Object.keys(params).sort((a, b) => a.localeCompare(b));
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac('sha1', token).update(data).digest('base64');
}

describe('validateTwilioSignature', () => {
  const params = {
    MessageSid: 'SM123',
    From: 'whatsapp:+972521234567',
    Body: 'שלום',
  };

  it('returns true for a valid HMAC-SHA1 signature', () => {
    const signature = computeSignature(WEBHOOK_URL, params, AUTH_TOKEN);

    expect(validateTwilioSignature(signature, WEBHOOK_URL, params, AUTH_TOKEN)).toBe(true);
  });

  it('returns false for a forged signature', () => {
    const forged = computeSignature(WEBHOOK_URL, params, 'wrong-token');

    expect(validateTwilioSignature(forged, WEBHOOK_URL, params, AUTH_TOKEN)).toBe(false);
  });

  it('returns false when signature is undefined', () => {
    expect(validateTwilioSignature(undefined, WEBHOOK_URL, params, AUTH_TOKEN)).toBe(false);
  });

  it('returns false when auth token is undefined', () => {
    const signature = computeSignature(WEBHOOK_URL, params, AUTH_TOKEN);

    expect(validateTwilioSignature(signature, WEBHOOK_URL, params, undefined)).toBe(false);
  });
});
