import { describe, expect, it } from 'vitest';
import { stripWhatsAppPrefix, formatWhatsAppTo } from '../../src/lib/phone.js';

describe('stripWhatsAppPrefix', () => {
  it('strips whatsapp: prefix from a Twilio number', () => {
    expect(stripWhatsAppPrefix('whatsapp:+972521234567')).toBe('+972521234567');
  });

  it('returns the input unchanged when no prefix is present', () => {
    expect(stripWhatsAppPrefix('+972521234567')).toBe('+972521234567');
  });

  it('handles an empty string', () => {
    expect(stripWhatsAppPrefix('')).toBe('');
  });

  it('does not strip partial prefix', () => {
    expect(stripWhatsAppPrefix('whatsap:+972521234567')).toBe('whatsap:+972521234567');
  });

  it('strips prefix from international numbers', () => {
    expect(stripWhatsAppPrefix('whatsapp:+14155551234')).toBe('+14155551234');
  });
});

describe('formatWhatsAppTo', () => {
  it('prepends whatsapp: prefix to a bare E.164 number', () => {
    expect(formatWhatsAppTo('+972521234567')).toBe('whatsapp:+972521234567');
  });

  it('does not double-prefix an already formatted number', () => {
    expect(formatWhatsAppTo('whatsapp:+972521234567')).toBe('whatsapp:+972521234567');
  });

  it('prepends prefix to international numbers', () => {
    expect(formatWhatsAppTo('+14155551234')).toBe('whatsapp:+14155551234');
  });

  it('handles a number without the plus sign', () => {
    expect(formatWhatsAppTo('972521234567')).toBe('whatsapp:972521234567');
  });
});
