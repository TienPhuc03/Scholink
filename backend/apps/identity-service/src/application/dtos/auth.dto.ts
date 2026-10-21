import { z } from 'zod';

export const RegisterDtoSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  fullName: z.string().min(2, 'Họ và tên ít nhất 2 ký tự').max(100),
  role: z.enum(['STUDENT', 'ORGANIZER']).default('STUDENT'),
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RefreshTokenDtoSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token không được để trống'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;
