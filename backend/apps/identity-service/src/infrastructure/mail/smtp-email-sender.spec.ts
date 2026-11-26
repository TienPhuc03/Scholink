import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { DomainException, ErrorCode } from '@shared';
import { SmtpEmailSender } from './smtp-email-sender';

describe('SmtpEmailSender', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('sends styled HTML and plain-text OTP email when SMTP is configured', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '<msg-123@scholink.edu.vn>' });
    const fakeTransporter = { sendMail } as unknown as Transporter;
    const config = new ConfigService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'mailer@scholink.edu.vn',
      SMTP_PASS: 'app-password',
      SMTP_FROM: 'Scholink <no-reply@scholink.edu.vn>',
    });

    const sender = new SmtpEmailSender(config, fakeTransporter);
    expect(sender.isConfigured).toBe(true);

    const res = await sender.sendOtpEmail({
      to: 'student@uit.edu.vn',
      otpCode: '482913',
      purpose: 'VERIFY_EMAIL',
      expiresInMinutes: 5,
    });

    expect(res).toEqual({
      delivered: true,
      channel: 'SMTP',
      messageId: '<msg-123@scholink.edu.vn>',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailArg = sendMail.mock.calls[0][0];
    expect(mailArg.to).toBe('student@uit.edu.vn');
    expect(mailArg.from).toBe('Scholink <no-reply@scholink.edu.vn>');
    expect(mailArg.subject).toContain('Scholink');
    expect(mailArg.text).toContain('482913');
    expect(mailArg.html).toContain('482913');
    expect(mailArg.html).toContain('5 phút');
  });

  it('normalizes SMTP_SECURE=true on port 587 to false (STARTTLS)', () => {
    const config = new ConfigService({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer@scholink.edu.vn',
      SMTP_PASS: 'app-password',
    });
    const sender = new SmtpEmailSender(config);
    expect(sender.isConfigured).toBe(true);
    expect((sender as unknown as { smtpConfig: { secure: boolean } }).smtpConfig.secure).toBe(
      false,
    );
  });

  it('uses RESET_PASSWORD copy for password reset emails', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '<reset-1@scholink.edu.vn>' });
    const fakeTransporter = { sendMail } as unknown as Transporter;
    const config = new ConfigService({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
    });

    const sender = new SmtpEmailSender(config, fakeTransporter);
    await sender.sendOtpEmail({
      to: 'student@uit.edu.vn',
      otpCode: '777888',
      purpose: 'RESET_PASSWORD',
      expiresInMinutes: 5,
    });

    const mailArg = sendMail.mock.calls[0][0];
    expect(mailArg.subject).toContain('đặt lại mật khẩu');
    expect(mailArg.text).toContain('777888');
  });

  it('throws 503 UPSTREAM_UNAVAILABLE in production when SMTP_HOST is not configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;
    const sender = new SmtpEmailSender(new ConfigService({}));
    expect(sender.isConfigured).toBe(false);

    await expect(
      sender.sendOtpEmail({
        to: 'student@uit.edu.vn',
        otpCode: '123456',
        purpose: 'VERIFY_EMAIL',
        expiresInMinutes: 5,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
      statusCode: 503,
    });
  });

  it('wraps SMTP transport failures into 503 UPSTREAM_UNAVAILABLE', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const fakeTransporter = { sendMail } as unknown as Transporter;
    const config = new ConfigService({ SMTP_HOST: 'smtp.example.com' });
    const sender = new SmtpEmailSender(config, fakeTransporter);

    await expect(
      sender.sendOtpEmail({
        to: 'student@uit.edu.vn',
        otpCode: '123456',
        purpose: 'VERIFY_EMAIL',
        expiresInMinutes: 5,
      }),
    ).rejects.toBeInstanceOf(DomainException);
  });
});
