import { z } from 'zod';
import { AppError } from '../../lib/app-error.js';
import type {
  CreatePaymentProcessRequest,
  CreatePaymentProcessResult,
  MeshulamService,
} from './types.js';

const MESHULAM_TIMEOUT_MS = 30_000;

const meshulamResponseSchema = z.object({
  status: z.number(),
  err: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
  data: z
    .object({
      url: z.string().optional(),
      processId: z.string().optional(),
      processToken: z.string().optional(),
    })
    .optional(),
});

export class MeshulamHttpClient implements MeshulamService {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async createPaymentProcess(
    request: CreatePaymentProcessRequest
  ): Promise<CreatePaymentProcessResult> {
    const formData = new URLSearchParams();
    formData.append('pageCode', request.pageCode);
    formData.append('userId', request.userId);
    formData.append('sum', String(request.sum));
    formData.append('description', request.description);
    formData.append('successUrl', request.successUrl);
    formData.append('cancelUrl', request.cancelUrl);

    if (request.fullName) formData.append('fullName', request.fullName);
    if (request.phone) formData.append('phone', request.phone);
    if (request.email) formData.append('email', request.email);
    if (request.paymentNum) formData.append('paymentNum', String(request.paymentNum));

    if (request.customFields) {
      for (const [key, value] of Object.entries(request.customFields)) {
        formData.append(`cField_${key}`, value);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MESHULAM_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/light/server/1.0/createPaymentProcess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError({
          statusCode: 504,
          code: 'meshulam_timeout',
          message: `Meshulam API request timed out after ${MESHULAM_TIMEOUT_MS}ms`,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new AppError({
        statusCode: 502,
        code: 'meshulam_api_error',
        message: `Meshulam API returned ${response.status}`,
      });
    }

    const raw: unknown = await response.json();
    const parseResult = meshulamResponseSchema.safeParse(raw);
    if (!parseResult.success) {
      throw new AppError({
        statusCode: 502,
        code: 'meshulam_invalid_response',
        message: 'Meshulam API returned an unexpected response shape',
      });
    }

    const body = parseResult.data;

    if (body.status !== 1 || !body.data?.url) {
      throw new AppError({
        statusCode: 502,
        code: 'meshulam_payment_failed',
        message: body.err?.message ?? 'Failed to create Meshulam payment process',
      });
    }

    return {
      url: body.data.url,
      processId: body.data.processId ?? '',
      processToken: body.data.processToken ?? '',
    };
  }
}
