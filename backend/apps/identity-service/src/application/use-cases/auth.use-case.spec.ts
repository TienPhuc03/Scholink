import { JwtService } from '@nestjs/jwt';
import { AuthUseCase } from './auth.use-case';
import { IUserRepository } from '../../domain/ports/user.repository.port';
import { IPassportRepository } from '../../domain/ports/passport.repository.port';
import { CryptoService, DomainException, ErrorCode } from '@shared';
import * as bcrypt from 'bcryptjs';

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
});
