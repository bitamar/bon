import { randomUUID } from 'node:crypto';
import type {
  AllocationRequest,
  AllocationResult,
  EmergencyUsageReport,
  ShaamService,
} from './types.js';

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

  async reportEmergencyUsage(
    _businessId: string,
    _usedNumbers: readonly EmergencyUsageReport[]
  ): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
  }
}
