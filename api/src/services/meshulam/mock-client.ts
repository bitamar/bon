import { randomUUID } from 'node:crypto';
import type {
  CreatePaymentProcessRequest,
  CreatePaymentProcessResult,
  MeshulamService,
} from './types.js';

export class MeshulamMockClient implements MeshulamService {
  readonly calls: CreatePaymentProcessRequest[] = [];

  async createPaymentProcess(
    request: CreatePaymentProcessRequest
  ): Promise<CreatePaymentProcessResult> {
    this.calls.push(request);
    const processId = `mock-${randomUUID()}`;
    return {
      url: `https://sandbox.meshulam.co.il/pay/${processId}`,
      processId,
      processToken: `token-${randomUUID()}`,
    };
  }
}
