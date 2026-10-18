import { z } from 'zod';

export const UpdatePassportDtoSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarAssetId: z.string().optional(),
  education: z
    .object({
      institution: z.string().min(1),
      major: z.string().min(1),
      startYear: z.number().int().min(2000).max(2100),
      endYear: z.number().int().min(2000).max(2100).optional(),
      gpa: z.number().min(0).max(10).optional(),
      gpaScale: z.number().default(4),
    })
    .optional(),
  skills: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),
  cvAssetId: z.string().optional(),
  pitchVideoAssetId: z.string().optional(),
  isLookingForTeammate: z.boolean().optional(),
  isOpenForScholarship: z.boolean().optional(),
  isOpenForMentoring: z.boolean().optional(),
});

export type UpdatePassportDto = z.infer<typeof UpdatePassportDtoSchema>;

export const CreateConsentDtoSchema = z.object({
  previewId: z.string().min(1),
  snapshotId: z.string().min(1),
  opportunityId: z.string().min(1),
  submissionId: z.string().optional(),
  profileVersion: z.number().int().min(1),
  ruleVersion: z.number().int().min(1),
  payloadHash: z.string().min(64),
  manifestHash: z.string().min(64),
});

export type CreateConsentDto = z.infer<typeof CreateConsentDtoSchema>;
