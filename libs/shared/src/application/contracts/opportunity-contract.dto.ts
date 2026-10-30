import { z } from 'zod';
import { sanitizePlainText } from './identity-contract.dto';

/**
 * Mục 10 SRS: Mô hình điều kiện sàng lọc (Eligibility Rule)
 * Toán tử: EQ, IN, GTE, LTE, EXISTS | Loại: HARD (bắt buộc) hoặc SOFT (ưu tiên/xem xét)
 */
export const EligibilityRuleDtoSchema = z.object({
  fieldKey: z.string().trim().min(1).max(100),
  operator: z.enum(['EQ', 'IN', 'GTE', 'LTE', 'EXISTS']),
  value: z.unknown().optional(),
  scale: z.number().positive().optional(),
  type: z.enum(['HARD', 'SOFT']).default('HARD'),
});

export type EligibilityRuleDto = z.infer<typeof EligibilityRuleDtoSchema>;

export const CreateOpportunityDtoSchema = z.object({
  type: z.enum(['SCHOLARSHIP', 'COMPETITION']),
  title: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(10, 'Tiêu đề ít nhất 10 ký tự').max(200, 'Tiêu đề tối đa 200 ký tự')),
  description: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(20, 'Mô tả ít nhất 20 ký tự').max(5000)),
  organizerName: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(2).max(150)),
  sourceUrl: z.string().trim().url('URL không đúng định dạng').optional(),
  applyMode: z.enum(['IN_APP', 'EXTERNAL']).default('IN_APP'),
  registerDeadline: z.string().datetime(),
  submitDeadline: z.string().datetime().optional(),
  timezone: z.string().trim().default('Asia/Ho_Chi_Minh'),
  fundingLevel: z.enum(['FULL', 'PARTIAL', 'OTHER']).optional(),
  competitionMode: z.enum(['INDIVIDUAL', 'TEAM']).optional(),
  minTeamSize: z.number().int().min(2).optional(),
  maxTeamSize: z.number().int().min(2).optional(),
  requiredFields: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  eligibilityRules: z.array(EligibilityRuleDtoSchema).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(15).optional(),
});

export type CreateOpportunityDto = z.infer<typeof CreateOpportunityDtoSchema>;

export const CheckReadinessQueryDtoSchema = z.object({
  opportunityId: z.string().trim().min(1, 'opportunityId không được để trống'),
});

export type CheckReadinessQueryDto = z.infer<typeof CheckReadinessQueryDtoSchema>;

export const QueryOpportunityDtoSchema = z.object({
  type: z.enum(['SCHOLARSHIP', 'COMPETITION']).optional(),
  keyword: z.string().trim().max(100).optional(),
  applyMode: z.enum(['IN_APP', 'EXTERNAL']).optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v !== undefined && v !== '' ? Math.min(Math.max(Number(v), 1), 50) : 10)),
  cursor: z.string().trim().optional(),
});

export type QueryOpportunityDto = z.infer<typeof QueryOpportunityDtoSchema>;

export const CreatePreviewDtoSchema = z.object({
  opportunityId: z.string().trim().min(1),
  submissionId: z.string().trim().min(1),
  expectedRuleVersion: z.number().int().min(1).default(1),
  attachmentIds: z
    .array(z.string().trim().min(1))
    .max(5, 'Tối đa 5 tệp đính kèm mỗi lần nộp')
    .default([]),
});

export type CreatePreviewDto = z.infer<typeof CreatePreviewDtoSchema>;

export const SubmitApplicationDtoSchema = z.object({
  opportunityId: z.string().trim().min(1),
  submissionId: z.string().trim().optional(),
  submissionType: z.enum(['INDIVIDUAL', 'TEAM']).default('INDIVIDUAL'),
  teamId: z.string().trim().optional(),
  expectedRuleVersion: z.number().int().min(1).default(1),
  previewId: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  profileVersion: z.number().int().min(1),
  payloadHash: z.string().trim().length(64, 'payloadHash phải là chuỗi SHA-256 64 ký tự hex'),
  consentId: z.string().trim().min(1),
});

export type SubmitApplicationDto = z.infer<typeof SubmitApplicationDtoSchema>;
