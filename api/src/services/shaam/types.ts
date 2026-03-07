export type AllocationResult =
  | { status: 'approved'; allocationNumber: string }
  | { status: 'rejected'; errorCode: string; errorMessage: string }
  | { status: 'emergency'; emergencyNumber: string }
  | { status: 'deferred'; reason: string };

export interface AllocationRequest {
  readonly businessId: string;
  readonly invoiceId: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly invoiceDate: string;
  readonly totalExclVatMinorUnits: number;
  readonly vatMinorUnits: number;
  readonly totalInclVatMinorUnits: number;
  readonly customerTaxId: string | null;
  readonly items: ReadonlyArray<{
    readonly description: string;
    readonly quantity: number;
    readonly unitPriceMinorUnits: number;
    readonly lineTotalMinorUnits: number;
  }>;
}

export interface EmergencyUsageReport {
  readonly number: string;
  readonly invoiceId: string;
}

export interface ShaamService {
  requestAllocationNumber(request: AllocationRequest): Promise<AllocationResult>;
  reportEmergencyUsage?(
    businessId: string,
    usedNumbers: readonly EmergencyUsageReport[]
  ): Promise<void>;
}
