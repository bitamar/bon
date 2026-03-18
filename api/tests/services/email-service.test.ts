import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/app-error.js';

const mockSend = vi.fn();

vi.mock('resend', () => {
  class MockResend {
    emails = { send: mockSend };
  }
  return { Resend: MockResend };
});

vi.mock('../../src/env.js', () => ({
  env: { RESEND_API_KEY: 'test-key', EMAIL_FROM: 'test@bon.co.il' },
}));

const { emailService } = await import('../../src/services/email-service.js');

describe('ResendEmailService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends an email successfully when the provider returns no error', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await expect(
      emailService.send({
        to: 'customer@example.com',
        subject: 'Your invoice',
        html: '<p>Hello</p>',
      })
    ).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledOnce();
    const [payload] = mockSend.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      from: 'test@bon.co.il',
      to: 'customer@example.com',
      subject: 'Your invoice',
      html: '<p>Hello</p>',
    });
  });

  it('includes attachments in the payload when provided', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_2' }, error: null });

    const attachment = { filename: 'invoice.pdf', content: Buffer.from('pdf-bytes') };

    await emailService.send({
      to: 'customer@example.com',
      subject: 'Invoice with attachment',
      html: '<p>See attached</p>',
      attachments: [attachment],
    });

    const [payload] = mockSend.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      attachments: [{ filename: 'invoice.pdf', content: attachment.content }],
    });
  });

  it('throws AppError with code email_provider_error when the provider returns an error', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'quota exceeded' } });

    await expect(
      emailService.send({
        to: 'customer@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('email_provider_error');
      expect(appErr.statusCode).toBe(502);
      expect(appErr.message).toContain('quota exceeded');
      return true;
    });
  });
});
