import { AppError } from '../../lib/app-error.js';
import type {
  CreatePaymentProcessRequest,
  CreatePaymentProcessResult,
  MeshulamService,
} from './types.js';

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

    const response = await fetch(`${this.baseUrl}/api/light/server/1.0/createPaymentProcess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new AppError({
        statusCode: 502,
        code: 'meshulam_api_error',
        message: `Meshulam API returned ${response.status}`,
      });
    }

    const body = (await response.json()) as {
      status: number;
      err?: { message?: string };
      data?: { url?: string; processId?: string; processToken?: string };
    };

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
