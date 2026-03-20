import { describe, expect, it } from 'vitest';
import {
  e164PhoneSchema,
  conversationStatusSchema,
  messageDirectionSchema,
  llmRoleSchema,
  twilioInboundSchema,
} from '@bon/types/whatsapp';

describe('whatsapp type schemas', () => {
  describe('e164PhoneSchema', () => {
    it('accepts valid E.164 Israeli mobile', () => {
      expect(e164PhoneSchema.parse('+972521234567')).toBe('+972521234567');
    });

    it('accepts valid US number', () => {
      expect(e164PhoneSchema.parse('+12125551234')).toBe('+12125551234');
    });

    it('rejects number without + prefix', () => {
      expect(() => e164PhoneSchema.parse('972521234567')).toThrow();
    });

    it('rejects number starting with +0', () => {
      expect(() => e164PhoneSchema.parse('+0521234567')).toThrow();
    });

    it('rejects empty string', () => {
      expect(() => e164PhoneSchema.parse('')).toThrow();
    });

    it('rejects too-short number', () => {
      expect(() => e164PhoneSchema.parse('+12345')).toThrow();
    });
  });

  describe('conversationStatusSchema', () => {
    it('accepts valid statuses', () => {
      expect(conversationStatusSchema.parse('active')).toBe('active');
      expect(conversationStatusSchema.parse('idle')).toBe('idle');
      expect(conversationStatusSchema.parse('blocked')).toBe('blocked');
    });

    it('rejects invalid status', () => {
      expect(() => conversationStatusSchema.parse('deleted')).toThrow();
    });
  });

  describe('messageDirectionSchema', () => {
    it('accepts inbound and outbound', () => {
      expect(messageDirectionSchema.parse('inbound')).toBe('inbound');
      expect(messageDirectionSchema.parse('outbound')).toBe('outbound');
    });
  });

  describe('llmRoleSchema', () => {
    it('accepts all roles', () => {
      for (const role of ['user', 'assistant', 'tool_call', 'tool_result']) {
        expect(llmRoleSchema.parse(role)).toBe(role);
      }
    });
  });

  describe('twilioInboundSchema', () => {
    it('parses a valid inbound payload', () => {
      const result = twilioInboundSchema.parse({
        MessageSid: 'SM123abc',
        From: 'whatsapp:+972521234567',
        Body: 'שלום',
      });

      expect(result.MessageSid).toBe('SM123abc');
      expect(result.From).toBe('whatsapp:+972521234567');
      expect(result.Body).toBe('שלום');
      expect(result.NumMedia).toBe(0);
    });

    it('coerces NumMedia from string', () => {
      const result = twilioInboundSchema.parse({
        MessageSid: 'SM456',
        From: 'whatsapp:+972521234567',
        Body: 'hi',
        NumMedia: '2',
      });

      expect(result.NumMedia).toBe(2);
    });

    it('rejects missing MessageSid', () => {
      expect(() =>
        twilioInboundSchema.parse({
          From: 'whatsapp:+972521234567',
          Body: 'hi',
        })
      ).toThrow();
    });

    it('rejects empty Body', () => {
      expect(() =>
        twilioInboundSchema.parse({
          MessageSid: 'SM789',
          From: 'whatsapp:+972521234567',
          Body: '',
        })
      ).toThrow();
    });
  });
});
