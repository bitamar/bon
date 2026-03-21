import { describe, expect, it, beforeEach } from 'vitest';
import { setupIntegrationTest } from '../utils/server.js';
import { createUser } from '../utils/businesses.js';
import { db } from '../../src/db/client.js';
import { whatsappConversations, whatsappMessages } from '../../src/db/schema.js';
import { MockWhatsAppClient } from '../../src/services/whatsapp/mock-client.js';
import { randomUUID } from 'node:crypto';

const server = setupIntegrationTest();

// ── helpers at module scope (S2004) ──

function mockWhatsApp(): MockWhatsAppClient {
  return server.app.whatsapp as MockWhatsAppClient;
}

async function injectWebhook(overrides: Record<string, string> = {}) {
  const params: Record<string, string> = {
    MessageSid: `SM${randomUUID().replaceAll('-', '')}`,
    From: 'whatsapp:+972521234567',
    Body: 'שלום',
    NumMedia: '0',
    ...overrides,
  };
  return server.app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(params).toString(),
  });
}

async function getConversations() {
  return db.select().from(whatsappConversations);
}

async function getMessages() {
  return db.select().from(whatsappMessages);
}

describe('POST /webhooks/whatsapp', () => {
  beforeEach(() => {
    mockWhatsApp().sentMessages.splice(0);
  });

  it('processes valid inbound from registered user → 200 + message inserted', async () => {
    await createUser({ phone: '+972521234567', whatsappEnabled: true });

    const res = await injectWebhook();

    expect(res.statusCode).toBe(200);
    const conversations = await getConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.phone).toBe('+972521234567');

    const messages = await getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.body).toBe('שלום');
    expect(messages[0]!.direction).toBe('inbound');
    expect(messages[0]!.llmRole).toBe('user');
  });

  it('replies with registration prompt for unknown phone → 200', async () => {
    const res = await injectWebhook({
      From: 'whatsapp:+972599999999',
    });

    expect(res.statusCode).toBe(200);
    expect(mockWhatsApp().sentMessages).toHaveLength(1);
    expect(mockWhatsApp().sentMessages[0]!.body).toContain('לא מחובר לחשבון BON');

    // No conversation or message created
    const conversations = await getConversations();
    expect(conversations).toHaveLength(0);
  });

  it('handles duplicate MessageSid idempotently → 200 + no double insert', async () => {
    await createUser({ phone: '+972521234567', whatsappEnabled: true });
    const sid = `SM${randomUUID().replaceAll('-', '')}`;

    await injectWebhook({ MessageSid: sid });
    await injectWebhook({ MessageSid: sid });

    const messages = await getMessages();
    expect(messages).toHaveLength(1);
  });

  it('replies with text-only message for media-only (NumMedia > 0, no Body)', async () => {
    const res = await injectWebhook({
      NumMedia: '2',
      Body: '',
    });

    expect(res.statusCode).toBe(200);
    expect(mockWhatsApp().sentMessages).toHaveLength(1);
    expect(mockWhatsApp().sentMessages[0]!.body).toContain('טקסט');
  });

  it('processes text normally when media + text are present', async () => {
    await createUser({ phone: '+972521234567', whatsappEnabled: true });

    const res = await injectWebhook({
      NumMedia: '1',
      Body: 'הנה תמונה',
    });

    expect(res.statusCode).toBe(200);
    const messages = await getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.body).toBe('הנה תמונה');
  });

  it('replies with opt-out message when whatsappEnabled is false → 200', async () => {
    await createUser({ phone: '+972521234567', whatsappEnabled: false });

    const res = await injectWebhook();

    expect(res.statusCode).toBe(200);
    expect(mockWhatsApp().sentMessages).toHaveLength(1);
    expect(mockWhatsApp().sentMessages[0]!.body).toContain('WhatsApp מושבת');

    // No conversation created
    const conversations = await getConversations();
    expect(conversations).toHaveLength(0);
  });

  it('rate limits when >10 messages in last 60 seconds → 200 + throttle reply', async () => {
    await createUser({ phone: '+972521234567', whatsappEnabled: true });

    // Send 10 messages (at the limit)
    for (let i = 0; i < 10; i++) {
      await injectWebhook({ MessageSid: `SM${randomUUID().replaceAll('-', '')}` });
    }

    // Clear sent messages to check only the throttle reply
    mockWhatsApp().sentMessages.splice(0);

    // 11th message should be throttled
    const res = await injectWebhook({ MessageSid: `SM${randomUUID().replaceAll('-', '')}` });

    expect(res.statusCode).toBe(200);
    expect(mockWhatsApp().sentMessages).toHaveLength(1);
    expect(mockWhatsApp().sentMessages[0]!.body).toContain('לאט לאט');
  });

  it('creates conversation with activeBusinessId = null for user with no businesses', async () => {
    await createUser({ phone: '+972521234567', whatsappEnabled: true });

    await injectWebhook();

    const conversations = await getConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.activeBusinessId).toBeNull();
  });

  it('returns 200 for empty body text (no media)', async () => {
    const res = await injectWebhook({ Body: '', NumMedia: '0' });

    expect(res.statusCode).toBe(200);
    const messages = await getMessages();
    expect(messages).toHaveLength(0);
  });

  it('returns 200 for missing MessageSid', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ From: 'whatsapp:+972521234567', Body: 'test' }).toString(),
    });

    expect(res.statusCode).toBe(200);
    const messages = await getMessages();
    expect(messages).toHaveLength(0);
  });
});
