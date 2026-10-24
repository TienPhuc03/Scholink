import { z } from 'zod';

export const CreateTeamDtoSchema = z.object({
  competitionId: z.string().min(1),
  name: z.string().min(3, 'Tên đội ít nhất 3 ký tự').max(50),
  description: z.string().max(500).optional(),
  minSize: z.number().int().min(2).default(2),
  maxSize: z.number().int().min(2).default(5),
});

export type CreateTeamDto = z.infer<typeof CreateTeamDtoSchema>;

export const JoinTeamDtoSchema = z.object({
  teamId: z.string().min(1),
  message: z.string().max(200).optional(),
});

export type JoinTeamDto = z.infer<typeof JoinTeamDtoSchema>;

export const SendMessageDtoSchema = z.object({
  content: z.string().min(1, 'Nội dung tin nhắn không được rỗng').max(2000),
  assetId: z.string().optional(),
});

export type SendMessageDto = z.infer<typeof SendMessageDtoSchema>;
