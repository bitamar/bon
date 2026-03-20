import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TwilioWhatsAppClient } from '../../../src/services/whatsapp/twilio-client.js';

// ── Twilio SDK mock ──

const mockCreate = vi.fn();

vi.mock('twilio', () => ({
  default: {
    Twilio: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createClient(): TwilioWhatsAppClient {
  return new TwilioWhatsAppClient('ACtest', 'token123', 'whatsapp:+15555550100');
}

describe('TwilioWhatsAppClient', () => {
  describe('sendMessage — success', () => {
    it('calls Twilio with correct params and returns sent result', async () => {
      mockCreate.mockResolvedValue({ sid: 'SM00001' });

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'שלום!');

      expect(mockCreate).toHaveBeenCalledWith({
        from: 'whatsapp:+15555550100',
        to: 'whatsapp:+972521234567',
        body: 'שלום!',
      });
      expect(result).toEqual({ status: 'sent', messageSid: 'SM00001' });
    });

    it('does not double-prefix an already formatted to number', async () => {
      mockCreate.mockResolvedValue({ sid: 'SM00002' });

      const client = createClient();
      await client.sendMessage('whatsapp:+972521234567', 'Hello');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'whatsapp:+972521234567' })
      );
    });
  });

  describe('sendMessage — error handling', () => {
    it('maps invalid number (21211) to non-retryable', async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error('Invalid number'), { code: 21211 }));

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'Test');

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.retryable).toBe(false);
        expect(result.error).toBe('Invalid number');
      }
    });

    it('maps opted-out (63032) to non-retryable', async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error('User opted out'), { code: 63032 }));

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'Test');

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.retryable).toBe(false);
      }
    });

    it('maps outside-24h-window (63016) to non-retryable', async () => {
      mockCreate.mockRejectedValue(
        Object.assign(new Error('Outside session window'), { code: 63016 })
      );

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'Test');

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.retryable).toBe(false);
      }
    });

    it('maps rate limit (20429) to retryable', async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error('Rate limited'), { code: 20429 }));

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'Test');

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.retryable).toBe(true);
      }
    });

    it('treats unknown error codes as retryable', async () => {
      mockCreate.mockRejectedValue(Object.assign(new Error('Server error'), { code: 50000 }));

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'Test');

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.retryable).toBe(true);
        expect(result.error).toBe('Server error');
      }
    });

    it('handles errors without a code as retryable', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'Test');

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.retryable).toBe(true);
        expect(result.error).toBe('Network error');
      }
    });

    it('handles errors without a message', async () => {
      mockCreate.mockRejectedValue({ code: 99999 });

      const client = createClient();
      const result = await client.sendMessage('+972521234567', 'Test');

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.error).toBe('Unknown Twilio error');
        expect(result.retryable).toBe(true);
      }
    });
  });
});
