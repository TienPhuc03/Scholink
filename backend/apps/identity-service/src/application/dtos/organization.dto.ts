import { z } from 'zod';

export const CreateOrganizationDtoSchema = z.object({
  name: z.string().min(2, 'Tên đơn vị ít nhất 2 ký tự').max(100),
  taxCode: z.string().max(20).optional(),
  email: z.string().email('Email không đúng định dạng').optional(),
  website: z.string().url('Website không đúng định dạng URL').optional(),
  description: z.string().max(500).optional(),
});

export type CreateOrganizationDto = z.infer<typeof CreateOrganizationDtoSchema>;

export const AssignOrganizerDtoSchema = z.object({
  userEmail: z.string().email('Email người dùng không hợp lệ'),
  role: z.enum(['ORGANIZER_ADMIN', 'ORGANIZER_MEMBER']).default('ORGANIZER_MEMBER'),
});

export type AssignOrganizerDto = z.infer<typeof AssignOrganizerDtoSchema>;
