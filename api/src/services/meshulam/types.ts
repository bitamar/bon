export interface CreatePaymentProcessRequest {
  readonly pageCode: string;
  readonly userId: string;
  readonly sum: number;
  readonly description: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly fullName?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly paymentNum?: number;
  readonly customFields?: Record<string, string>;
}

export interface CreatePaymentProcessResult {
  readonly url: string;
  readonly processId: string;
  readonly processToken: string;
}

export interface MeshulamService {
  createPaymentProcess(request: CreatePaymentProcessRequest): Promise<CreatePaymentProcessResult>;
}
