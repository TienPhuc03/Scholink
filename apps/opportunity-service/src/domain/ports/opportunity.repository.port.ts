import { Opportunity } from '../opportunity.entity';

export interface OpportunityFilter {
  type?: 'SCHOLARSHIP' | 'COMPETITION';
  keyword?: string;
  status?: string;
  applyMode?: 'IN_APP' | 'EXTERNAL';
  limit?: number;
  cursor?: string;
}

export interface IOpportunityRepository {
  findById(id: string): Promise<Opportunity | null>;
  findMany(filter: OpportunityFilter): Promise<Opportunity[]>;
  save(opportunity: Opportunity): Promise<void>;
  update(opportunity: Opportunity): Promise<void>;
}

export const OPPORTUNITY_REPOSITORY = 'OPPORTUNITY_REPOSITORY';
