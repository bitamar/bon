import { beforeEach, describe, expect, it } from 'vitest';
import { MockWhatsAppClient } from '../../../src/services/whatsapp/mock-client.js';

let client: MockWhatsAppClient;

beforeEach(() => {
  client = new MockWhatsAppClient();
});

describe('MockWhatsAppClient', () => {
  it('returns a sent result with a message SID', async () => {
    const result = await client.sendMessage('+972521234567', 'Hello');

    expect(result.status).toBe('sent');
    if (result.status === 'sent') {
      expect(result.messageSid).toMatch(/^SM[0-9a-f]{32}$/);
    }
  });

  it('stores sent messages in sentMessages array', async () => {
    await client.sendMessage('+972521234567', 'First');
    await client.sendMessage('+972529876543', 'Second');

    expect(client.sentMessages).toHaveLength(2);
    expect(client.sentMessages[0].to).toBe('+972521234567');
    expect(client.sentMessages[0].body).toBe('First');
    expect(client.sentMessages[1].to).toBe('+972529876543');
    expect(client.sentMessages[1].body).toBe('Second');
  });

  it('generates unique SIDs per message', async () => {
    await client.sendMessage('+972521234567', 'A');
    await client.sendMessage('+972521234567', 'B');

    const sids = client.sentMessages.map((m) => m.sid);
    expect(new Set(sids).size).toBe(2);
  });

  it('clears sent messages', async () => {
    await client.sendMessage('+972521234567', 'Hello');
    expect(client.sentMessages).toHaveLength(1);

    client.clear();
    expect(client.sentMessages).toHaveLength(0);
  });
});
