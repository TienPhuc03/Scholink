import { z } from 'zod';
export {
  EligibilityRuleDtoSchema,
  EligibilityRuleDto,
  CreateOpportunityDtoSchema,
  CreateOpportunityDto,
  CheckReadinessQueryDtoSchema,
  CheckReadinessQueryDto,
  QueryOpportunityDtoSchema,
  QueryOpportunityDto,
  CreatePreviewDtoSchema,
  CreatePreviewDto,
  SubmitApplicationDtoSchema,
  SubmitApplicationDto,
} from '@shared';

/**
 * F24: Cập nhật trạng thái hồ sơ ứng tuyển từ Organizer Kanban
 */
export const UpdateApplicationStatusDtoSchema = z.object({
  status: z.enum([
    'SUBMITTED',
    'REVIEWING',
    'SHORTLISTED',
    'INTERVIEW',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
  ]),
  expectedVersion: z.number().int().optional(),
  note: z.string().trim().optional(),
});

export interface UpdateApplicationStatusDto {
  status:
    | 'SUBMITTED'
    | 'REVIEWING'
    | 'SHORTLISTED'
    | 'INTERVIEW'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'WITHDRAWN';
  expectedVersion?: number;
  note?: string;
}

export interface OpportunitySummaryResponseDto {
  id: string;
  type: 'SCHOLARSHIP' | 'COMPETITION';
  title: string;
  slug?: string;
  organizerName: string;
  applyMode: 'IN_APP' | 'EXTERNAL';
  sourceUrl?: string | null;
  coverImageUrl?: string | null;
  fundingLevel?: string | null;
  minGpa?: number;
  requiredIelts?: number;
  registerDeadline: string;
  timezone: string;
  isPromoted: boolean;
  status: string;
  tags?: readonly string[] | string[];
  requiredFields?: readonly string[] | string[];
  ruleVersion?: number;
  version?: number;
  createdAt?: string;
}

export interface OpportunityDetailResponseDto extends OpportunitySummaryResponseDto {
  description: string;
  benefits?: string | null;
  requirements?: string | null;
  organizationId?: string | null;
  submitDeadline?: string | null;
  competitionMode?: 'INDIVIDUAL' | 'TEAM' | null;
  minTeamSize?: number | null;
  maxTeamSize?: number | null;
  eligibilityRules?: readonly Record<string, any>[] | Record<string, any>[];
  version: number;
  updatedAt?: string;
}

export interface PaginatedOpportunityResponseDto {
  items: OpportunitySummaryResponseDto[];
  nextCursor?: string | null;
  hasMore?: boolean;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    nextCursor?: string | null;
  };
}
