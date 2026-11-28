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
  TeamMemberConsentDtoSchema,
  TeamMemberConsentDto,
  CreateSubmissionIntentDtoSchema,
  CreateSubmissionIntentDto,
  AbortSubmissionIntentDtoSchema,
  AbortSubmissionIntentDto,
  SubmitApplicationDtoSchema,
  SubmitApplicationDto,
  ApplySnapshotRetentionDtoSchema,
  ApplySnapshotRetentionDto,
  TestCaseExecutionStatusSchema,
  TestCaseExecutionStatus,
  TestCaseLogItemDtoSchema,
  TestCaseLogItemDto,
  EvaluateTestResultLogDtoSchema,
  EvaluateTestResultLogDto,
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

/** A competition a student wants to form a team for, not yet in the catalog (admin reviews it). */
export const SuggestCompetitionDtoSchema = z.object({
  sourceUrl: z
    .string()
    .trim()
    .url('Đường dẫn cuộc thi không hợp lệ')
    .max(500)
    .refine((v) => /^https?:\/\//i.test(v), 'Đường dẫn phải bắt đầu bằng http:// hoặc https://'),
  title: z.string().trim().min(3, 'Tên cuộc thi ít nhất 3 ký tự').max(200),
  registerDeadline: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), 'Hạn đăng ký phải ở tương lai'),
  organizerName: z.string().trim().max(200).optional(),
});

export type SuggestCompetitionDto = z.infer<typeof SuggestCompetitionDtoSchema>;
