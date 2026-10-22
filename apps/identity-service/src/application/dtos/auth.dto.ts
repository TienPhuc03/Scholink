import { z } from 'zod';

/**
 * FR-AUTH-02 & FR-AUTH-07: Người dùng đăng ký công khai chỉ truyền email, password, fullName.
 * Role luôn do Server gán cố định là STUDENT (Admin cấp ORGANIZER qua quy trình xác minh đơn vị riêng).
 */
export const RegisterDtoSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(150),
  password: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .max(128, 'Mật khẩu không vượt quá 128 ký tự'),
  fullName: z.string().trim().min(2, 'Họ và tên ít nhất 2 ký tự').max(100),
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(150),
  password: z.string().min(1, 'Mật khẩu không được để trống').max(128),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RefreshTokenDtoSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token không hợp lệ'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;
