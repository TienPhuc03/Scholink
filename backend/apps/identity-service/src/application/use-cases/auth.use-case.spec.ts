import { JwtService } from '@nestjs/jwt';
import { AuthUseCase } from './auth.use-case';
import { IUserRepository } from '../../domain/ports/user.repository.port';
import { IPassportRepository } from '../../domain/ports/passport.repository.port';
import { CryptoService, DomainException, ErrorCode } from '@shared';
import * as bcrypt from 'bcryptjs';
import { User } from '../../domain/user.entity';
import { VerifiedSocialIdentity } from '../../domain/ports/social-identity-verifier.port';

describe('AuthUseCase Integration Test (Authentication & Security Rules)', () => {
  let authUseCase: AuthUseCase;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockPassportRepo: jest.Mocked<IPassportRepository>;
  let jwtService: JwtService;
  let cryptoService: CryptoService;

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      saveSession: jest.fn(),
      findSessionByTokenHash: jest.fn(),
      markSessionUsed: jest.fn(),
      revokeSessionFamily: jest.fn(),
      revokeAllUserSessions: jest.fn(),
      findOtpRecord: jest.fn(),
      saveOtpRecord: jest.fn(),
      deleteOtpRecord: jest.fn(),
    };

    mockPassportRepo = {
      findByStudentId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      saveMediaAsset: jest.fn(),
      findMediaAssetById: jest.fn(),
      findMediaAssetsByIds: jest.fn(),
      updateMediaAsset: jest.fn(),
      saveConsent: jest.fn(),
      findConsentById: jest.fn(),
    };

    jwtService = new JwtService({ secret: 'test-jwt-secret-key-32-chars-long-min' });
    cryptoService = new CryptoService();

    authUseCase = new AuthUseCase(
      mockUserRepo,
      mockPassportRepo,
      jwtService,
      cryptoService,
    );
  });

  describe('Registration & Role Protection', () => {
    it('should register a new student and enforce role = STUDENT regardless of input', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const result = await authUseCase.register({
        email: 'test@scholink.edu.vn',
        password: 'ValidPassword@2026',
        fullName: 'Nguyen Van A',
      });

      expect(result.role).toBe('STUDENT');
      expect(result.status).toBe('PENDING_VERIFICATION');
      expect(mockUserRepo.save).toHaveBeenCalledTimes(1);
      expect(mockPassportRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should reject registration if email is already taken', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        id: 'existing_user_id',
        email: 'test@scholink.edu.vn',
      } as any);

      await expect(
        authUseCase.register({
          email: 'test@scholink.edu.vn',
          password: 'ValidPassword@2026',
          fullName: 'Nguyen Van B',
        }),
      ).rejects.toThrow(DomainException);
    });
  });

  describe('Login & Credential Verification', () => {
    it('should issue Access and Refresh tokens on valid credentials', async () => {
      const password = 'CorrectPassword@2026';
      const passwordHash = await bcrypt.hash(password, 10);

      mockUserRepo.findByEmail.mockResolvedValue({
        id: 'user_login_01',
        email: 'test@scholink.edu.vn',
        fullName: 'Test User',
        passwordHash,
        status: 'ACTIVE',
        role: 'STUDENT',
        sessionVersion: 1,
      } as any);

      const tokens = await authUseCase.login({
        email: 'test@scholink.edu.vn',
        password,
      });

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.user.role).toBe('STUDENT');
      expect(mockUserRepo.saveSession).toHaveBeenCalledTimes(1);
    });

    it('should reject login on invalid credentials with 401 Unauthorized', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword@2026', 10);

      mockUserRepo.findByEmail.mockResolvedValue({
        id: 'user_login_02',
        email: 'test@scholink.edu.vn',
        passwordHash,
        status: 'ACTIVE',
      } as any);

      await expect(
        authUseCase.login({
          email: 'test@scholink.edu.vn',
          password: 'WrongPassword@2026',
        }),
      ).rejects.toThrow(DomainException);
    });
  });

  describe('Session tokens (FR-AUTH-04)', () => {
    it('marks the access and refresh tokens with their own type', async () => {
      const passwordHash = await bcrypt.hash('ValidPassword@2026', 4);
      mockUserRepo.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'test@scholink.edu.vn',
        fullName: 'Nguyen Van A',
        role: 'STUDENT',
        status: 'ACTIVE',
        passwordHash,
        sessionVersion: 1,
      } as any);

      const tokens = await authUseCase.login({ email: 'test@scholink.edu.vn', password: 'ValidPassword@2026' });

      expect(jwtService.decode(tokens.accessToken)).toMatchObject({ typ: 'access' });
      expect(jwtService.decode(tokens.refreshToken)).toMatchObject({ typ: 'refresh' });
    });

    it('logout revokes the whole token family of the device', async () => {
      await authUseCase.logout('u1', 'sess1', 'fam1');

      expect(mockUserRepo.revokeSessionFamily).toHaveBeenCalledWith('fam1', 'USER_LOGOUT');
    });
  });

  describe('Refresh rotation under concurrency (FR-AUTH-04)', () => {
    it('treats the request that loses the claim as a replay and issues nothing', async () => {
      const refreshToken = jwtService.sign({ sub: 'u1', sessionVersion: 1, typ: 'refresh' });
      mockUserRepo.findSessionByTokenHash.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        tokenHash: 'h',
        familyId: 'fam1',
        isUsed: false,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockUserRepo.findById.mockResolvedValue({ id: 'u1', status: 'ACTIVE', sessionVersion: 1 } as any);
      mockUserRepo.markSessionUsed.mockResolvedValue(false);

      await expect(authUseCase.refresh({ refreshToken })).rejects.toMatchObject({
        code: ErrorCode.UNAUTHENTICATED,
      });

      expect(mockUserRepo.revokeSessionFamily).toHaveBeenCalledWith('fam1', 'REFRESH_TOKEN_REPLAY_OR_REVOKED');
      expect(mockUserRepo.saveSession).not.toHaveBeenCalled();
    });
  });

  describe('Password reset does not reveal accounts (FR-AUTH-03)', () => {
    const activeUser = { id: 'u1', email: 'a@uit.edu.vn', status: 'ACTIVE' } as any;

    it('answers a real and an unknown email identically', async () => {
      mockUserRepo.findByEmail.mockResolvedValueOnce(activeUser).mockResolvedValueOnce(null);

      const known = await authUseCase.forgotPassword({ email: 'a@uit.edu.vn' });
      const unknown = await authUseCase.forgotPassword({ email: 'a@uit.edu.vn' });

      expect({ ...unknown, devOtpPreview: '' }).toEqual({ ...known, devOtpPreview: '' });
      expect(unknown.devOtpPreview).toBe('');
      expect(mockUserRepo.saveOtpRecord).toHaveBeenCalledTimes(2);
    });

    it('applies the cooldown to an unknown email too', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.findOtpRecord.mockResolvedValue({
        assertCanResend: () => {
          throw new DomainException(ErrorCode.OTP_COOLDOWN, 'Vui lòng chờ 60 giây', 429);
        },
      } as any);

      await expect(authUseCase.forgotPassword({ email: 'ghost@uit.edu.vn' })).rejects.toMatchObject({
        code: ErrorCode.OTP_COOLDOWN,
      });
    });

    it('rejects a reset for an unknown email with the OTP error, not 404', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.findOtpRecord.mockResolvedValue(null);
      const noCode = authUseCase.resetPassword({
        email: 'ghost@uit.edu.vn',
        otpCode: '123456',
        newPassword: 'ValidPassword@2026',
      });
      await expect(noCode).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID, statusCode: 400 });

      mockUserRepo.findOtpRecord.mockResolvedValue({
        verifyAttempt: () => ({ matched: true, updatedRecord: {} }),
      } as any);
      const matchedCode = authUseCase.resetPassword({
        email: 'ghost@uit.edu.vn',
        otpCode: '123456',
        newPassword: 'ValidPassword@2026',
      });
      await expect(matchedCode).rejects.toMatchObject({ code: ErrorCode.OTP_INVALID, statusCode: 400 });
    });
  });

  describe('OTP Cooldown (FR-AUTH)', () => {
    it('should reject OTP request if sent within 60 seconds cooldown (429 Too Many Requests)', async () => {
      const now = new Date();
      mockUserRepo.findOtpRecord.mockResolvedValue({
        assertCanResend: jest.fn().mockImplementation(() => {
          throw new DomainException(ErrorCode.LIMIT_EXCEEDED, 'Vui lòng chờ 60 giây', 429);
        }),
      } as any);

      await expect(
        authUseCase.sendOtp({
          email: 'student@scholink.edu.vn',
          purpose: 'VERIFY_EMAIL',
        }),
      ).rejects.toThrow(DomainException);
    });
  });

  describe('Social login (FR-AUTH-02, Google/Facebook via Firebase)', () => {
    const existing = (props: Partial<{ status: any; firebaseUid: string }> = {}) =>
      new User('user_social_01', {
        email: 'an@gmail.com',
        passwordHash: 'x',
        fullName: 'An',
        role: 'STUDENT',
        status: props.status ?? 'ACTIVE',
        firebaseUid: props.firebaseUid,
      });
    const withIdentity = (identity: Partial<VerifiedSocialIdentity>) =>
      new AuthUseCase(mockUserRepo, mockPassportRepo, jwtService, cryptoService, undefined, {
        verify: jest.fn().mockResolvedValue({
          uid: 'fb_uid_1',
          email: 'an@gmail.com',
          emailVerified: true,
          name: 'Nguyen An',
          provider: 'google.com',
          ...identity,
        }),
      });
    const idToken = { idToken: 'x'.repeat(40) };

    it('creates an ACTIVE student with a passport for a new verified email', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      const result = await withIdentity({}).socialLogin(idToken);
      const saved = mockUserRepo.save.mock.calls[0][0] as User;
      expect(saved.status).toBe('ACTIVE');
      expect(saved.firebaseUid).toBe('fb_uid_1');
      expect(saved.fullName).toBe('Nguyen An');
      expect(mockPassportRepo.save).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBeDefined();
      expect(result.user.role).toBe('STUDENT');
    });

    it('keeps a new account PENDING_VERIFICATION when the provider did not verify the email', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      const result = await withIdentity({ emailVerified: false, provider: 'facebook.com' }).socialLogin(idToken);
      expect(result.user.status).toBe('PENDING_VERIFICATION');
    });

    it('links an existing account when the email is verified, and activates a pending one', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(existing({ status: 'PENDING_VERIFICATION' }));
      const result = await withIdentity({}).socialLogin(idToken);
      const updated = mockUserRepo.update.mock.calls[0][0] as User;
      expect(updated.firebaseUid).toBe('fb_uid_1');
      expect(result.user.status).toBe('ACTIVE');
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to take over an existing account with an unverified email', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(existing());
      await expect(withIdentity({ emailVerified: false }).socialLogin(idToken)).rejects.toMatchObject({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
      });
      expect(mockUserRepo.saveSession).not.toHaveBeenCalled();
    });

    it('lets an account already linked to this Firebase uid sign in even if the email is unverified', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(existing({ firebaseUid: 'fb_uid_1' }));
      const result = await withIdentity({ emailVerified: false }).socialLogin(idToken);
      expect(result.accessToken).toBeDefined();
      expect(mockUserRepo.update).not.toHaveBeenCalled();
    });

    it('rejects blocked accounts, accounts without email, and a server without Firebase config', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(existing({ status: 'BLOCKED', firebaseUid: 'fb_uid_1' }));
      await expect(withIdentity({}).socialLogin(idToken)).rejects.toMatchObject({ statusCode: 403 });
      await expect(withIdentity({ email: undefined }).socialLogin(idToken)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
      await expect(authUseCase.socialLogin(idToken)).rejects.toMatchObject({ statusCode: 503 });
    });
  });
});
