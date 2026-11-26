import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { DomainException, ErrorCode } from '@shared';
import {
  IEmailSender,
  OtpEmailPurpose,
  SendOtpEmailParams,
  SendOtpEmailResult,
} from '../../domain/ports/email-sender.port';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

const isDevOrTestEnv = (): boolean =>
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

function maskEmailAddress(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Adapter gửi email OTP thật qua SMTP bằng Nodemailer.
 * Khi chưa cấu hình `SMTP_HOST`:
 * - Ở development/test: giữ tương thích với `devOtpPreview`.
 * - Ở production/staging: báo lỗi 503 UPSTREAM_UNAVAILABLE thay vì im lặng nuốt OTP.
 */
@Injectable()
export class SmtpEmailSender implements IEmailSender {
  private readonly logger = new Logger(SmtpEmailSender.name);
  private readonly smtpConfig: SmtpConfig | null;
  private readonly transporter: Transporter | null;

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() transporterOverride?: Transporter,
  ) {
    this.smtpConfig = this.resolveConfig();
    if (transporterOverride) {
      this.transporter = transporterOverride;
      if (!this.smtpConfig) {
        this.smtpConfig = {
          host: 'custom-transporter',
          port: 587,
          secure: false,
          from: 'Scholink <no-reply@scholink.edu.vn>',
        };
      }
      return;
    }

    if (this.smtpConfig) {
      this.transporter = nodemailer.createTransport({
        host: this.smtpConfig.host,
        port: this.smtpConfig.port,
        secure: this.smtpConfig.secure,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        ...(this.smtpConfig.user && this.smtpConfig.pass
          ? {
              auth: {
                user: this.smtpConfig.user,
                pass: this.smtpConfig.pass,
              },
            }
          : {}),
      });
      this.logger.log(
        `SMTP EmailSender đã sẵn sàng (${this.smtpConfig.host}:${this.smtpConfig.port}, secure=${this.smtpConfig.secure}).`,
      );
    } else {
      this.transporter = null;
      if (isDevOrTestEnv()) {
        this.logger.warn(
          'Chưa cấu hình SMTP_HOST — OTP chỉ hiển thị ở devOtpPreview / log nội bộ trong development/test.',
        );
      } else {
        this.logger.error(
          'CẢNH BÁO PRODUCTION: Chưa cấu hình SMTP_HOST! Yêu cầu gửi OTP sẽ trả 503 UPSTREAM_UNAVAILABLE.',
        );
      }
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null && this.smtpConfig !== null;
  }

  async sendOtpEmail(params: SendOtpEmailParams): Promise<SendOtpEmailResult> {
    if (!this.transporter || !this.smtpConfig) {
      if (!isDevOrTestEnv()) {
        throw new DomainException(
          ErrorCode.UPSTREAM_UNAVAILABLE,
          'Dịch vụ gửi email OTP chưa được cấu hình trên máy chủ',
          503,
        );
      }
      return { delivered: false, channel: 'DEV_PREVIEW' };
    }

    const template = this.buildOtpTemplate(
      params.purpose,
      params.otpCode,
      params.expiresInMinutes,
    );

    try {
      const info = await this.transporter.sendMail({
        from: this.smtpConfig.from,
        to: params.to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      this.logger.log(
        `Đã gửi email OTP (${params.purpose}) tới ${maskEmailAddress(params.to)} [messageId=${info.messageId ?? 'n/a'}]`,
      );
      return {
        delivered: true,
        channel: 'SMTP',
        messageId: info.messageId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Gửi email OTP (${params.purpose}) tới ${maskEmailAddress(params.to)} thất bại: ${msg}`,
      );
      throw new DomainException(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Không thể gửi mã OTP qua email lúc này, vui lòng thử lại sau',
        503,
      );
    }
  }

  private getEnv(key: string): string | undefined {
    const fromConfig = this.configService?.get<string>(key);
    if (fromConfig !== undefined && fromConfig !== null) {
      return String(fromConfig);
    }
    return process.env[key];
  }

  private resolveConfig(): SmtpConfig | null {
    const host = this.getEnv('SMTP_HOST')?.trim();
    if (!host) {
      return null;
    }

    const rawPort = this.getEnv('SMTP_PORT')?.trim();
    const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : 587;
    const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;

    const rawSecure = this.getEnv('SMTP_SECURE')?.trim().toLowerCase();
    let secure =
      rawSecure === 'true' || rawSecure === '1'
        ? true
        : rawSecure === 'false' || rawSecure === '0'
          ? false
          : port === 465;

    // Cổng 587 chuẩn dùng STARTTLS (secure=false); bật SSL trực tiếp trên 587 gây lỗi TLS wrong version number.
    if (port === 587 && secure) {
      this.logger.warn(
        'SMTP_PORT=587 dùng STARTTLS nên đã tự chuyển SMTP_SECURE sang false (nếu muốn SSL trực tiếp hãy dùng cổng 465).',
      );
      secure = false;
    }

    const user = this.getEnv('SMTP_USER')?.trim() || undefined;
    const pass = this.getEnv('SMTP_PASS')?.trim() || undefined;
    const from =
      this.getEnv('SMTP_FROM')?.trim() ||
      (user ? `Scholink <${user}>` : 'Scholink <no-reply@scholink.edu.vn>');

    return { host, port, secure, user, pass, from };
  }

  private buildOtpTemplate(
    purpose: OtpEmailPurpose,
    otpCode: string,
    expiresInMinutes: number,
  ): { subject: string; text: string; html: string } {
    const safeOtp = escapeHtml(otpCode);
    const isVerify = purpose === 'VERIFY_EMAIL';
    const subject = isVerify
      ? '[Scholink] Mã xác thực địa chỉ email của bạn'
      : '[Scholink] Mã OTP đặt lại mật khẩu';
    const title = isVerify ? 'Xác thực email tài khoản Scholink' : 'Đặt lại mật khẩu Scholink';
    const intro = isVerify
      ? 'Cảm ơn bạn đã đăng ký Scholink. Vui lòng nhập mã OTP 6 chữ số dưới đây để hoàn tất kích hoạt tài khoản:'
      : 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Scholink của bạn. Nhập mã OTP 6 chữ số dưới đây để tiếp tục:';
    const ignoreNote = isVerify
      ? 'Nếu bạn không tạo tài khoản này, vui lòng bỏ qua email.'
      : 'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này và giữ an toàn tài khoản của bạn.';

    const text = [
      title,
      '',
      intro,
      '',
      `Mã OTP của bạn: ${otpCode}`,
      `Thời hạn hiệu lực: ${expiresInMinutes} phút (tối đa 5 lần nhập sai).`,
      '',
      'Tuyệt đối không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên hỗ trợ.',
      ignoreNote,
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background-color:#F7F8FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:#3925D7;padding:20px 24px;color:#FFFFFF;">
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.2px;">Scholink</div>
        <div style="font-size:12px;opacity:0.85;margin-top:2px;">Cơ hội học bổng &amp; cuộc thi cho sinh viên</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <h1 style="margin:0 0 12px;font-size:18px;line-height:1.35;color:#111827;">${escapeHtml(title)}</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4B5563;">${escapeHtml(intro)}</p>
        <div style="background:#EEF0FD;border:1px dashed #3925D7;border-radius:10px;padding:18px;text-align:center;margin-bottom:20px;">
          <div style="font-size:12px;color:#4B5563;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Mã xác thực OTP</div>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#3925D7;font-family:'Courier New',monospace;">${safeOtp}</div>
          <div style="font-size:12px;color:#4B5563;margin-top:8px;">Có hiệu lực trong <strong>${expiresInMinutes} phút</strong></div>
        </div>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#DC2626;font-weight:600;">
          Không chia sẻ mã OTP này cho bất kỳ ai.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#6B7280;">${escapeHtml(ignoreNote)}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject, text, html };
  }
}
