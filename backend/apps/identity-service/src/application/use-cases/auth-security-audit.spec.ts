import { JwtService } from '@nestjs/jwt';
import { CryptoService, DomainException, ErrorCode, OtpPurpose } from '@shared';
import { AuthUseCase } from './auth.use-case';
import { IUserRepository } from '../../domain/ports/user.repository.port';
import { IPassportRepository } from '../../domain/ports/passport.repository.port';
import { OTP_LOCK_MS, OTP_MAX_ATTEMPTS, OtpRecord } from '../../domain/otp-record.entity';

describe('Auth Security Audit (#4 OTP leakage & #6 Atomic OTP lock)', () => {
  let authUseCase: AuthUseCase;
  let cryptoService: CryptoService;
  let otpStore: Map<string, OtpRecord>;
  let mockUserRepo: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    otpStore = new Map();
    cryptoService = new CryptoService();

    mockUserRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue({
        id: 'usr_victim',
        email: 'victim@uit.edu.vn',
        normalizedEmail: 'victim@uit.edu.vn',
        status: 'ACTIVE',
        role: 'STUDENT',
        sessionVersion: 1,
      }),
      save: jest.fn(),
      update: jest.fn(),
      saveSession: jest.fn(),
      findSessionByTokenHash: jest.fn(),
      markSessionUsed: jest.fn(),
      revokeSessionFamily: jest.fn(),
      revokeAllUserSessions: jest.fn(),
      findOtpRecord: jest.fn(async (email: string, purpose: OtpPurpose) => {
        return otpStore.get(`${email}:${purpose}`) ?? null;
      }),
      claimOtpAttempt: jest.fn(async (email: string, purpose: OtpPurpose, now: Date) => {
        const key = `${email}:${purpose}`;
        const existing = otpStore.get(key);
        if (!existing) return null;
        if (existing.attempts >= OTP_MAX_ATTEMPTS) return null;
        if (now > existing.expiresAt) return null;
        if (existing.lockedUntil && now < existing.lockedUntil) return null;
        const nextAttempts = existing.attempts + 1;
        const updated = new OtpRecord({
          ...existing.props,
          attempts: nextAttempts,
          lockedUntil:
            nextAttempts >= OTP_MAX_ATTEMPTS
              ? new Date(now.getTime() + OTP_LOCK_MS)
              : existing.lockedUntil,
        });
        otpStore.set(key, updated);
        return updated;
      }),
      saveOtpRecord: jest.fn(async (record: OtpRecord) => {
        otpStore.set(`${record.normalizedEmail}:${record.purpose}`, record);
      }),
      deleteOtpRecord: jest.fn(async (email: string, purpose: OtpPurpose) => {
        return otpStore.delete(`${email}:${purpose}`);
      }),
    };

    const mockPassportRepo = {
      findByStudentId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      saveMediaAsset: jest.fn(),
      findMediaAssetById: jest.fn(),
      findMediaAssetsByIds: jest.fn(),
      updateMediaAsset: jest.fn(),
      saveConsent: jest.fn(),
      findConsentById: jest.fn(),
    } as unknown as jest.Mocked<IPassportRepository>;

    const jwtService = new JwtService({ secret: 'audit-test-jwt-secret-key-32-chars!!' });
    authUseCase = new AuthUseCase(mockUserRepo, mockPassportRepo, jwtService, cryptoService);
  });

  it('#4 hides devOtpPreview when NODE_ENV is undefined or production', async () => {
    const prev = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      const resUndefined = await authUseCase.forgotPassword({ email: 'victim@uit.edu.vn' });
      expect(resUndefined.devOtpPreview).toBe('');

      process.env.NODE_ENV = 'production';
      otpStore.clear();
      const resProd = await authUseCase.forgotPassword({ email: 'victim@uit.edu.vn' });
      expect(resProd.devOtpPreview).toBe('');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('#6 locks OTP after exactly 5 concurrent wrong attempts', async () => {
    await authUseCase.sendOtp({ email: 'victim@uit.edu.vn', purpose: 'VERIFY_EMAIL' });

    const attempts = Array.from({ length: 10 }, (_, idx) =>
      authUseCase
        .verifyOtp({
          email: 'victim@uit.edu.vn',
          purpose: 'VERIFY_EMAIL',
          otpCode: String(100000 + idx),
        })
        .catch((err) => err),
    );

    const results = await Promise.all(attempts);
    const invalidCount = results.filter(
      (e) => e instanceof DomainException && e.code === ErrorCode.OTP_INVALID,
    ).length;
    const lockedCount = results.filter(
      (e) => e instanceof DomainException && e.code === ErrorCode.OTP_LOCKED,
    ).length;

    expect(invalidCount).toBe(4);
    expect(lockedCount).toBe(6);
  });

  it('dispatches OTP via IEmailSender when configured and rejects missing SMTP in production', async () => {
    const prev = process.env.NODE_ENV;
    const sendOtpEmail = jest.fn().mockResolvedValue({
      delivered: true,
      channel: 'SMTP',
      messageId: '<otp-1@scholink.edu.vn>',
    });

    const configuredSender = {
      isConfigured: true,
      sendOtpEmail,
    };
    const ucWithSmtp = new AuthUseCase(
      mockUserRepo,
      {} as IPassportRepository,
      new JwtService({ secret: 'audit-test-jwt-secret-key-32-chars!!' }),
      cryptoService,
      undefined,
      undefined,
      configuredSender,
    );

    process.env.NODE_ENV = 'production';
    try {
      const sent = await ucWithSmtp.sendOtp({
        email: 'victim@uit.edu.vn',
        purpose: 'VERIFY_EMAIL',
      });
      expect(sent.deliveryChannel).toBe('SMTP');
      expect(sent.devOtpPreview).toBe('');
      expect(sendOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'victim@uit.edu.vn',
          purpose: 'VERIFY_EMAIL',
          otpCode: expect.stringMatching(/^\d{6}$/),
          expiresInMinutes: 5,
        }),
      );

      // Anti-enumeration: unknown email must NOT invoke SMTP send, yet return identical response
      sendOtpEmail.mockClear();
      mockUserRepo.findByEmail.mockResolvedValueOnce(null);
      otpStore.clear();
      const forgotUnknown = await ucWithSmtp.forgotPassword({ email: 'ghost@uit.edu.vn' });
      expect(forgotUnknown.deliveryChannel).toBe('SMTP');
      expect(forgotUnknown.devOtpPreview).toBe('');
      expect(sendOtpEmail).not.toHaveBeenCalled();

      // Unconfigured sender injected in production must fail 503 and rollback OTP cooldown record
      const unconfiguredSender = {
        isConfigured: false,
        sendOtpEmail: jest.fn(),
      };
      const ucNoSmtp = new AuthUseCase(
        mockUserRepo,
        {} as IPassportRepository,
        new JwtService({ secret: 'audit-test-jwt-secret-key-32-chars!!' }),
        cryptoService,
        undefined,
        undefined,
        unconfiguredSender,
      );
      otpStore.clear();
      await expect(
        ucNoSmtp.sendOtp({ email: 'victim@uit.edu.vn', purpose: 'VERIFY_EMAIL' }),
      ).rejects.toMatchObject({ code: ErrorCode.UPSTREAM_UNAVAILABLE, statusCode: 503 });
      expect(otpStore.size).toBe(0);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
