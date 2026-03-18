import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/app-error.js';
import { MeshulamHttpClient } from '../../src/services/meshulam/http-client.js';
import type { CreatePaymentProcessRequest } from '../../src/services/meshulam/types.js';

// ── helpers ──

function makeRequest(
  overrides: Partial<CreatePaymentProcessRequest> = {}
): CreatePaymentProcessRequest {
  return {
    pageCode: 'PAGE123',
    userId: 'USER456',
    sum: 10000,
    description: 'Test payment',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
    ...overrides,
  };
}

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as Response;
}

describe('MeshulamHttpClient', () => {
  let client: MeshulamHttpClient;

  beforeEach(() => {
    client = new MeshulamHttpClient('https://meshulam.example.com');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns url, processId, and processToken on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({
          status: 1,
          data: {
            url: 'https://pay.example.com',
            processId: 'pid',
            processToken: 'ptk',
          },
        })
      )
    );

    const result = await client.createPaymentProcess(makeRequest());

    expect(result).toEqual({
      url: 'https://pay.example.com',
      processId: 'pid',
      processToken: 'ptk',
    });
  });

  it('posts to the correct endpoint with required form fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeOkResponse({
        status: 1,
        data: { url: 'https://pay.example.com', processId: 'pid', processToken: 'ptk' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    await client.createPaymentProcess(makeRequest());

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://meshulam.example.com/api/light/server/1.0/createPaymentProcess');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    const params = new URLSearchParams(init.body as string);
    expect(params.get('pageCode')).toBe('PAGE123');
    expect(params.get('userId')).toBe('USER456');
    expect(params.get('sum')).toBe('10000');
    expect(params.get('description')).toBe('Test payment');
    expect(params.get('successUrl')).toBe('https://example.com/success');
    expect(params.get('cancelUrl')).toBe('https://example.com/cancel');
  });

  it('appends optional fields when present', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeOkResponse({
        status: 1,
        data: { url: 'https://pay.example.com', processId: 'pid', processToken: 'ptk' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    await client.createPaymentProcess(
      makeRequest({
        fullName: 'Yossi Cohen',
        phone: '050-1234567',
        email: 'yossi@example.com',
        paymentNum: 3,
        customFields: { invoiceId: 'INV-001', ref: 'abc' },
      })
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(init.body as string);
    expect(params.get('fullName')).toBe('Yossi Cohen');
    expect(params.get('phone')).toBe('050-1234567');
    expect(params.get('email')).toBe('yossi@example.com');
    expect(params.get('paymentNum')).toBe('3');
    expect(params.get('cField_invoiceId')).toBe('INV-001');
    expect(params.get('cField_ref')).toBe('abc');
  });

  it('does not append optional fields when absent', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeOkResponse({
        status: 1,
        data: { url: 'https://pay.example.com', processId: 'pid', processToken: 'ptk' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    await client.createPaymentProcess(makeRequest());

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(init.body as string);
    expect(params.has('fullName')).toBe(false);
    expect(params.has('phone')).toBe(false);
    expect(params.has('email')).toBe(false);
    expect(params.has('paymentNum')).toBe(false);
  });

  it('throws AppError with meshulam_timeout and statusCode 504 on AbortError', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(client.createPaymentProcess(makeRequest())).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'meshulam_timeout' && err.statusCode === 504
    );
  });

  it('rethrows non-abort network errors as-is', async () => {
    const networkError = new Error('ECONNREFUSED');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

    await expect(client.createPaymentProcess(makeRequest())).rejects.toBe(networkError);
  });

  it('throws AppError with meshulam_api_error and statusCode 502 on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(500)));

    await expect(client.createPaymentProcess(makeRequest())).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'meshulam_api_error' && err.statusCode === 502
    );
  });

  it('throws AppError with meshulam_invalid_response when the response shape is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse({ unexpected: true })));

    await expect(client.createPaymentProcess(makeRequest())).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError &&
        err.code === 'meshulam_invalid_response' &&
        err.statusCode === 502
    );
  });

  it('throws AppError with meshulam_payment_failed when status is not 1', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse({ status: 0, data: {} })));

    await expect(client.createPaymentProcess(makeRequest())).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'meshulam_payment_failed' && err.statusCode === 502
    );
  });

  it('throws AppError with meshulam_payment_failed when status is 1 but url is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeOkResponse({ status: 1, data: { processId: 'pid' } }))
    );

    await expect(client.createPaymentProcess(makeRequest())).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError && err.code === 'meshulam_payment_failed' && err.statusCode === 502
    );
  });

  it('includes err.message in the AppError when payment fails with an error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({
          status: 0,
          err: { message: 'Invalid page code' },
          data: {},
        })
      )
    );

    await expect(client.createPaymentProcess(makeRequest())).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError &&
        err.code === 'meshulam_payment_failed' &&
        err.message === 'Invalid page code'
    );
  });

  it('falls back to a default message when payment fails without err.message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse({ status: 0, data: {} })));

    await expect(client.createPaymentProcess(makeRequest())).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof AppError &&
        err.code === 'meshulam_payment_failed' &&
        err.message === 'Failed to create Meshulam payment process'
    );
  });
});
