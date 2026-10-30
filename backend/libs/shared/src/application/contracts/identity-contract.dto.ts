import { z } from 'zod';

/**
 * Làm sạch chuỗi văn bản tại biên: loại bỏ thẻ HTML/script, javascript: URI và ký tự điều khiển
 * để tuân thủ Security Checklist (Sanitized HTML output / Boundary input validation).
 */
export const sanitizePlainText = (raw: string): string =>
  raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

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
  fullName: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(2, 'Họ và tên ít nhất 2 ký tự').max(100)),
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
 * FR-AUTH-02 & FR-AUTH-03: Luồng Email OTP (Xác minh email & Đặt lại mật khẩu)
 */
export const OtpPurposeSchema = z.enum(['VERIFY_EMAIL', 'RESET_PASSWORD']);
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;

export const SendOtpDtoSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(150),
  purpose: OtpPurposeSchema.default('VERIFY_EMAIL'),
});

export type SendOtpDto = z.infer<typeof SendOtpDtoSchema>;

export const VerifyOtpDtoSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(150),
  otpCode: z.string().trim().regex(/^\d{6}$/, 'Mã OTP phải gồm đúng 6 chữ số'),
  purpose: OtpPurposeSchema.default('VERIFY_EMAIL'),
});

export type VerifyOtpDto = z.infer<typeof VerifyOtpDtoSchema>;

export const ForgotPasswordDtoSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(150),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordDtoSchema>;

export const ResetPasswordDtoSchema = z.object({
  email: z.string().trim().email('Email không đúng định dạng').max(150),
  otpCode: z.string().trim().regex(/^\d{6}$/, 'Mã OTP phải gồm đúng 6 chữ số'),
  newPassword: z
    .string()
    .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
    .max(128, 'Mật khẩu mới không vượt quá 128 ký tự'),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordDtoSchema>;

/**
 * FR-PROF-04 & BR15: Quản lý tải lên tệp minh chứng (MediaAsset)
 */
export const MediaCategorySchema = z.enum([
  'AVATAR',
  'CV',
  'CERTIFICATE',
  'ACHIEVEMENT',
  'PITCH_VIDEO',
  'ATTACHMENT',
]);

export type MediaCategory = z.infer<typeof MediaCategorySchema>;

export const CreateUploadUrlDtoSchema = z.object({
  category: MediaCategorySchema,
  fileName: z
    .string()
    .transform(sanitizePlainText)
    .pipe(z.string().min(1, 'Tên tệp không được để trống').max(200)),
  mimeType: z.string().trim().min(3).max(100),
  sizeBytes: z.number().int().positive('Dung lượng tệp phải lớn hơn 0'),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/, 'sha256 phải là chuỗi hex 64 ký tự')
    .optional(),
});

export type CreateUploadUrlDto = z.infer<typeof CreateUploadUrlDtoSchema>;

export const CompleteUploadDtoSchema = z.object({
  fileHeaderHex: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{8,64}$/, 'fileHeaderHex phải là chuỗi hex hợp lệ (tối thiểu 4 byte đầu)')
    .optional(),
  sampleContent: z.string().max(4096).optional(),
  actualSizeBytes: z.number().int().positive().optional(),
});

export type CompleteUploadDto = z.infer<typeof CompleteUploadDtoSchema>;

/**
 * Chứng chỉ do sinh viên tự khai báo. Client KHÔNG được gửi `status`:
 * trạng thái luôn do server gán `SELF_DECLARED`, chỉ Admin mới được xác minh (VERIFIED).
 * Ngày cấp (issuedDate) không được vượt quá thời điểm hiện tại.
 */
export const CertificateInputSchema = z.object({
  type: z.string().transform(sanitizePlainText).pipe(z.string().min(1).max(50)),
  name: z.string().transform(sanitizePlainText).pipe(z.string().min(1).max(200)),
  score: z.string().transform(sanitizePlainText).pipe(z.string().max(50)).optional(),
  issuedDate: z
    .string()
    .datetime({ message: 'issuedDate phải là chuỗi ISO 8601' })
    .refine((val) => new Date(val).getTime() <= Date.now(), {
      message: 'Ngày cấp chứng chỉ (issuedDate) không được nằm ở tương lai',
    }),
  expiryDate: z.string().datetime({ message: 'expiryDate phải là chuỗi ISO 8601' }).optional(),
  assetId: z.string().trim().max(120).optional(),
});

export type CertificateInput = z.infer<typeof CertificateInputSchema>;

export const UpdatePassportDtoSchema = z.object({
  expectedVersion: z.number().int().min(1, 'expectedVersion phải >= 1').optional(),
  fullName: z.string().transform(sanitizePlainText).pipe(z.string().min(2).max(100)).optional(),
  bio: z.string().transform(sanitizePlainText).pipe(z.string().max(500)).optional(),
  avatarAssetId: z.string().trim().max(120).optional(),
  regionCode: z.string().transform(sanitizePlainText).pipe(z.string().max(20)).optional(),
  education: z
    .object({
      institution: z.string().transform(sanitizePlainText).pipe(z.string().min(1).max(200)),
      major: z.string().transform(sanitizePlainText).pipe(z.string().min(1).max(150)),
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
  skills: z
    .array(z.string().transform(sanitizePlainText).pipe(z.string().min(1).max(60)))
    .max(20)
    .optional(),
  achievements: z
    .array(z.string().transform(sanitizePlainText).pipe(z.string().min(1).max(300)))
    .max(20)
    .optional(),
  certificates: z.array(CertificateInputSchema).max(20).optional(),
  cvAssetId: z.string().trim().max(120).optional(),
  pitchVideoAssetId: z.string().trim().max(120).optional(),
  isLookingForTeammate: z.boolean().optional(),
  isOpenForScholarship: z.boolean().optional(),
  isOpenForMentoring: z.boolean().optional(),
});

export type UpdatePassportDto = z.infer<typeof UpdatePassportDtoSchema>;

export const ConsentScopeSchema = z.enum(['SNAPSHOT', 'ATTACHMENTS']);
export type ConsentScope = z.infer<typeof ConsentScopeSchema>;

export const CreateConsentDtoSchema = z.object({
  previewId: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  submissionId: z.string().trim().optional(),
  profileVersion: z.number().int().min(1),
  ruleVersion: z.number().int().min(1),
  payloadHash: z.string().trim().length(64, 'payloadHash phải là chuỗi SHA-256 64 ký tự hex'),
  manifestHash: z.string().trim().length(64, 'manifestHash phải là chuỗi SHA-256 64 ký tự hex'),
  scope: z
    .array(ConsentScopeSchema)
    .min(1, 'Phạm vi đồng ý (scope) phải có ít nhất 1 mục')
    .default(['SNAPSHOT', 'ATTACHMENTS']),
});

export type CreateConsentDto = z.infer<typeof CreateConsentDtoSchema>;
