export interface AbortIntentResult {
  outcome: 'ABORTED' | 'COMMITTED';
  message?: string;
}

/** What Collaboration needs to know about a team's competition. */
export interface CompetitionInfo {
  id: string;
  title: string;
  type: string;
  status: string; // PUBLISHED, PENDING_REVIEW (suggested by a student), REJECTED, CLOSED...
}

export interface IOpportunityClientPort {
  /**
   * null: no such opportunity. undefined: could not ask (no gRPC in tests, service down), so
   * callers skip the check rather than block team work on a Catalog outage.
   */
  getCompetition?(id: string): Promise<CompetitionInfo | null | undefined>;

  abortSubmissionIntent(params: {
    teamId: string;
    reservationId: string;
    fencingToken: number;
    reason?: string;
  }): Promise<AbortIntentResult>;
}

export const OPPORTUNITY_CLIENT = Symbol('OPPORTUNITY_CLIENT');
