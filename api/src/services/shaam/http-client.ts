import type {
  AllocationRequest,
  AllocationResult,
  EmergencyUsageReport,
  ShaamService,
} from './types.js';

/**
 * HTTP client for ITA's SHAAM API. Used for both sandbox and production —
 * the only difference is the base URL passed to the constructor.
 *
 * T12 provides the class shell; T13 fills in the real HTTP logic.
 */
export class ShaamHttpClient implements ShaamService {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async requestAllocationNumber(_request: AllocationRequest): Promise<AllocationResult> {
    // T13: Implement real HTTP call to ITA API at this.baseUrl
    throw new Error(
      `ShaamHttpClient.requestAllocationNumber not implemented — see T13. baseUrl=${this.baseUrl}`
    );
  }

  async reportEmergencyUsage(
    _businessId: string,
    _usedNumbers: readonly EmergencyUsageReport[]
  ): Promise<void> {
    // T14: Implement real HTTP call to report emergency usage to ITA
    throw new Error(
      `ShaamHttpClient.reportEmergencyUsage not implemented. baseUrl=${this.baseUrl}`
    );
  }
}
