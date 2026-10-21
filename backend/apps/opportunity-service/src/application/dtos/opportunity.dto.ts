import { z } from 'zod';

export const CreateOpportunityDtoSchema = z.object({
  type: z.enum(['SCHOLARSHIP', 'COMPETITION']),
  title: z.string().min(10, 'Tiêu đề ít nhất 10 ký tự').max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().min(20, 'Mô tả ít nhất 20 ký tự'),
  organizerName: z.string().min(2),
  sourceUrl: z.string().url('URL không đúng định dạng').optional(),
  applyMode: z.enum(['IN_APP', 'EXTERNAL']).default('IN_APP'),
  registerDeadline: z.string().datetime(),
  submitDeadline: z.string().datetime().optional(),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  fundingLevel: z.enum(['FULL', 'PARTIAL', 'OTHER']).optional(),
  competitionMode: z.enum(['INDIVIDUAL', 'TEAM']).optional(),
  minTeamSize: z.number().int().min(2).optional(),
  maxTeamSize: z.number().int().min(2).optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateOpportunityDto = z.infer<typeof CreateOpportunityDtoSchema>;

export const QueryOpportunityDtoSchema = z.object({
  type: z.enum(['SCHOLARSHIP', 'COMPETITION']).optional(),
  keyword: z.string().optional(),
  applyMode: z.enum(['IN_APP', 'EXTERNAL']).optional(),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 10)),
  cursor: z.string().optional(),
});

export type QueryOpportunityDto = z.infer<typeof QueryOpportunityDtoSchema>;

export const SubmitApplicationDtoSchema = z.object({
  opportunityId: z.string().min(1),
  submissionType: z.enum(['INDIVIDUAL', 'TEAM']).default('INDIVIDUAL'),
  teamId: z.string().optional(),
  previewId: z.string().min(1),
  snapshotId: z.string().min(1),
  profileVersion: z.number().int().min(1),
  payloadHash: z.string().min(64),
  consentId: z.string().min(1),
});

export type SubmitApplicationDto = z.infer<typeof SubmitApplicationDtoSchema>;

export const UpdateApplicationStatusDtoSchema = z.object({
  status: z.enum([
    'SUBMITTED',
    'REVIEWING',
    'SHORTLISTED',
    'INTERVIEW',
    'ACCEPTED',
    'REJECTED',
  ]),
  expectedVersion: z.number().int().min(1).optional(),
  note: z.string().max(500).optional(),
});

export type UpdateApplicationStatusDto = z.infer<typeof UpdateApplicationStatusDtoSchema>;
