import { z } from 'zod';

export const CreateTeamDtoSchema = z.object({
  competitionId: z.string().min(1),
  name: z.string().min(3, 'Tên đội ít nhất 3 ký tự').max(50),
  description: z.string().max(500).optional(),
  minSize: z.number().int().min(2).default(2),
  maxSize: z.number().int().min(2).default(5),
});

export type CreateTeamDto = z.infer<typeof CreateTeamDtoSchema>;

export const CreateJoinRequestDtoSchema = z.object({
  message: z.string().max(300).optional(),
});

export type CreateJoinRequestDto = z.infer<typeof CreateJoinRequestDtoSchema>;

export const ReviewJoinRequestDtoSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
});

export type ReviewJoinRequestDto = z.infer<typeof ReviewJoinRequestDtoSchema>;

export const TransferLeaderDtoSchema = z.object({
  newLeaderId: z.string().min(1),
});

export type TransferLeaderDto = z.infer<typeof TransferLeaderDtoSchema>;

export const SendMessageDtoSchema = z.object({
  content: z.string().min(1, 'Nội dung tin nhắn không được rỗng').max(4000),
  assetId: z.string().optional(),
  clientMsgId: z.string().optional(),
});

export type SendMessageDto = z.infer<typeof SendMessageDtoSchema>;

export const QueryMessagesDtoSchema = z.object({
  afterSeq: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type QueryMessagesDto = z.infer<typeof QueryMessagesDtoSchema>;

export const MarkReadDtoSchema = z.object({
  lastReadSeq: z.number().int().min(0),
});

export type MarkReadDto = z.infer<typeof MarkReadDtoSchema>;

export const SubmitTeamConsentDtoSchema = z.object({
  snapshotId: z.string().min(1),
  payloadHash: z.string().min(64),
});

export type SubmitTeamConsentDto = z.infer<typeof SubmitTeamConsentDtoSchema>;
