import { randomUUID } from 'node:crypto';
import type { AllocationRequest, AllocationResult, ShaamService } from './types.js';

export class ShaamMockClient implements ShaamService {
  private readonly delayMs: number;

  constructor(delayMs = 50) {
    this.delayMs = delayMs;
  }

  async requestAllocationNumber(_request: AllocationRequest): Promise<AllocationResult> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return {
      status: 'approved',
      allocationNumber: `MOCK-${randomUUID()}`,
    };
  }
}
