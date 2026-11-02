export interface AbortIntentResult {
  outcome: 'ABORTED' | 'COMMITTED';
  message?: string;
}

export interface IOpportunityClientPort {
  abortSubmissionIntent(params: {
    teamId: string;
    reservationId: string;
    fencingToken: number;
    reason?: string;
  }): Promise<AbortIntentResult>;
}

export const OPPORTUNITY_CLIENT = Symbol('OPPORTUNITY_CLIENT');
