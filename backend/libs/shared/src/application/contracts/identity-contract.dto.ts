import { z } from 'zod';

/**
 * FR-AUTH-02 & FR-AUTH-07: Người dùng đăng ký công khai chỉ truyền email, password, fullName.
 * Role luôn do Server gán cố định là STUDENT.
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

/**
 * Chứng chỉ do sinh viên tự khai báo. Client KHÔNG được gửi `status`:
 * trạng thái luôn do server gán `SELF_DECLARED`, chỉ Admin mới được xác minh (VERIFIED).
 */
export const CertificateInputSchema = z.object({
  type: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  score: z.string().trim().max(50).optional(),
  issuedDate: z.string().datetime({ message: 'issuedDate phải là chuỗi ISO 8601' }),
  expiryDate: z.string().datetime({ message: 'expiryDate phải là chuỗi ISO 8601' }).optional(),
  assetId: z.string().trim().max(120).optional(),
});

export type CertificateInput = z.infer<typeof CertificateInputSchema>;

export const UpdatePassportDtoSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(500).optional(),
  avatarAssetId: z.string().trim().max(120).optional(),
  regionCode: z.string().trim().max(20).optional(),
  education: z
    .object({
      institution: z.string().trim().min(1).max(200),
      major: z.string().trim().min(1).max(150),
      startYear: z.number().int().min(2000).max(2100),
      endYear: z.number().int().min(2000).max(2100).optional(),
      gpa: z.number().min(0).max(10).optional(),
      gpaScale: z
        .number()
        .refine((v) => v === 4 || v === 10, {
          message: 'Thang điểm GPA chỉ hỗ trợ hệ 4 hoặc hệ 10',
        })
        .default(4),
    })
    .optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  achievements: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  certificates: z.array(CertificateInputSchema).max(20).optional(),
  cvAssetId: z.string().trim().max(120).optional(),
  pitchVideoAssetId: z.string().trim().max(120).optional(),
  isLookingForTeammate: z.boolean().optional(),
  isOpenForScholarship: z.boolean().optional(),
  isOpenForMentoring: z.boolean().optional(),
});

export type UpdatePassportDto = z.infer<typeof UpdatePassportDtoSchema>;

export const CreateConsentDtoSchema = z.object({
  previewId: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  submissionId: z.string().trim().optional(),
  profileVersion: z.number().int().min(1),
  ruleVersion: z.number().int().min(1),
  payloadHash: z.string().trim().length(64, 'payloadHash phải là chuỗi SHA-256 64 ký tự hex'),
  manifestHash: z.string().trim().length(64, 'manifestHash phải là chuỗi SHA-256 64 ký tự hex'),
});

export type CreateConsentDto = z.infer<typeof CreateConsentDtoSchema>;
