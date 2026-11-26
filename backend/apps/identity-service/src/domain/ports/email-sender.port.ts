export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export type OtpEmailPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

export interface SendOtpEmailParams {
  to: string;
  otpCode: string;
  purpose: OtpEmailPurpose;
  expiresInMinutes: number;
}

export interface SendOtpEmailResult {
  delivered: boolean;
  channel: 'SMTP' | 'DEV_PREVIEW' | 'NONE';
  messageId?: string;
}

/**
 * Port gửi email giao dịch (OTP xác thực tài khoản / đặt lại mật khẩu) cho identity-service.
 */
export interface IEmailSender {
  readonly isConfigured: boolean;
  sendOtpEmail(params: SendOtpEmailParams): Promise<SendOtpEmailResult>;
}
