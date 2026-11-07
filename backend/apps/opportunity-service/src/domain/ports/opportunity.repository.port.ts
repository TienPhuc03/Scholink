import { Opportunity } from '../opportunity.entity';

export interface OpportunityFilter {
  type?: 'SCHOLARSHIP' | 'COMPETITION';
  keyword?: string;
  status?: string;
  organizationId?: string;
  applyMode?: 'IN_APP' | 'EXTERNAL';
  fundingLevel?: string;
  /** BR11: only opportunities whose registerDeadline is still ahead of [now]. */
  openOnly?: boolean;
  now?: Date;
  limit?: number;
  /** Keyset cursor: the last item of the previous page (sorted by registerDeadline, id). */
  cursor?: string;
}

export interface OpportunityCursor {
  d: string; // registerDeadline ISO
  id: string;
}

export interface IOpportunityRepository {
  findById(id: string): Promise<Opportunity | null>;
  findMany(filter: OpportunityFilter): Promise<Opportunity[]>;
  save(opportunity: Opportunity): Promise<void>;
  update(opportunity: Opportunity): Promise<void>;
}

export const OPPORTUNITY_REPOSITORY = 'OPPORTUNITY_REPOSITORY';
