import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
import {
  OrganizationMembershipModel,
  OrganizationMembershipDocument,
} from '../../infrastructure/persistence/organization.schema';
import { User } from '../../domain/user.entity';
import { Passport } from '../../domain/passport.entity';
import {
  OtpRecord,
  OTP_TTL_MS,
  OTP_COOLDOWN_MS,
} from '../../domain/otp-record.entity';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  SendOtpDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dtos/auth.dto';
import { DomainException, ErrorCode, CryptoService } from '@shared';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthUseCase {
  private readonly logger = new Logger(AuthUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PASSPORT_REPOSITORY) private readonly passportRepo: IPassportRepository,
    private readonly jwtService: JwtService,
    private readonly cryptoService: CryptoService,
    @Optional()
    @InjectModel(OrganizationMembershipModel.name)
    private readonly membershipModel?: Model<OrganizationMembershipDocument>,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userRepo.findByEmail(normalizedEmail);
    if (existing) {
      throw DomainException.conflict(ErrorCode.EMAIL_ALREADY_EXISTS, 'Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const userId = crypto.randomUUID();

    // FR-AUTH-07: Role luôn do server gán mặc định là STUDENT, không nhận từ client
    const user = new User(userId, {
      email: normalizedEmail,
      normalizedEmail,
      passwordHash,
      fullName: dto.fullName.trim(),
      role: 'STUDENT',
      status: 'ACTIVE',
    });

    await this.userRepo.save(user);

    const passport = new Passport(crypto.randomUUID(), {
      studentId: userId,
      profileVersion: 1,
      fullName: user.fullName,
      isLookingForTeammate: false,
      isOpenForScholarship: false,
      isOpenForMentoring: false,
    });
    await this.passportRepo.save(passport);

    return Object.freeze({
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) {
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Email hoặc mật khẩu không đúng', 401);
    }

    if (user.status === 'BLOCKED' || user.status === 'DELETED') {
      throw DomainException.forbidden('Tài khoản đã bị khóa hoặc thu hồi quyền truy cập');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Email hoặc mật khẩu không đúng', 401);
    }

    const familyId = crypto.randomUUID();
    const tokens = await this.issueTokenPair(user, familyId);

    // Look up active organization membership if user is an ORGANIZER
    let organizationId: string | undefined;
    if (this.membershipModel && user.role === 'ORGANIZER') {
      const activeMem = await this.membershipModel.findOne({ userId: user.id, status: 'ACTIVE' }).exec();
      if (activeMem) {
        organizationId = activeMem.organizationId;
      }
    }

    return Object.freeze({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId,
      },
    });
  }

  async refresh(dto: RefreshTokenDto) {
    const decoded = this.verifyRefreshJwt(dto.refreshToken);
    const tokenHash = this.cryptoService.sha256(dto.refreshToken);
    const session = await this.userRepo.findSessionByTokenHash(tokenHash);

    if (!session) {
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Phiên đăng nhập không tồn tại', 401);
    }

    // FR-AUTH-04: Phát hiện tái sử dụng Refresh Token cũ (Replay Attack) -> Thu hồi toàn bộ Token Family
    if (session.isUsed || session.isRevoked || new Date() > session.expiresAt) {
      await this.userRepo.revokeSessionFamily(session.familyId, 'REFRESH_TOKEN_REPLAY_OR_REVOKED');
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Phát hiện phiên không hợp lệ hoặc đã được sử dụng lại, vui lòng đăng nhập lại',
        401,
      );
    }

    const user = await this.userRepo.findById(decoded.sub);
    if (!user || user.status === 'BLOCKED' || user.status === 'DELETED') {
      await this.userRepo.revokeSessionFamily(session.familyId, 'USER_INACTIVE');
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Tài khoản không còn hiệu lực', 401);
    }

    // Kiểm tra sessionVersion: nếu user đã đổi/đặt lại mật khẩu thì token cũ lập tức mất hiệu lực
    if (decoded.sessionVersion !== undefined && decoded.sessionVersion !== user.sessionVersion) {
      await this.userRepo.revokeSessionFamily(session.familyId, 'SESSION_VERSION_MISMATCH');
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Mật khẩu hoặc quyền tài khoản đã thay đổi, vui lòng đăng nhập lại',
        401,
      );
    }

    // Đánh dấu session cũ đã dùng và xoay vòng Refresh Token mới
    await this.userRepo.markSessionUsed(session.id);
    const newTokens = await this.issueTokenPair(user, session.familyId);

    return Object.freeze(newTokens);
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    try {
      const tokenHash = this.cryptoService.sha256(refreshToken);
      const session = await this.userRepo.findSessionByTokenHash(tokenHash);
      if (session) {
        await this.userRepo.revokeSessionFamily(session.familyId, 'USER_LOGOUT');
      }
    } catch {
      // Idempotent logout
    }
  }

  /**
   * FR-AUTH-02: Gửi mã OTP xác thực email qua Email
   */
  async sendOtp(dto: SendOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userRepo.findOtpRecord(normalizedEmail, dto.purpose);

    if (existing && existing.lockedUntil && new Date() < existing.lockedUntil) {
      const waitMinutes = Math.ceil(
        (existing.lockedUntil.getTime() - Date.now()) / (60 * 1000),
      );
      throw new DomainException(
        ErrorCode.OTP_LOCKED,
        `Tài khoản đang bị khóa do nhập sai OTP nhiều lần. Vui lòng thử lại sau ${waitMinutes} phút`,
        429,
      );
    }

    // Cooldown 60s
    if (existing && !existing.isCooldownElapsed(new Date())) {
      const remainingSeconds = existing.getRemainingCooldownSeconds(new Date());
      throw new DomainException(
        ErrorCode.OTP_COOLDOWN,
        `Vui lòng chờ ${remainingSeconds} giây trước khi yêu cầu gửi lại mã OTP`,
        429,
      );
    }

    // 6 số ngẫu nhiên
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = this.cryptoService.sha256(
      `${normalizedEmail}:${dto.purpose}:${rawOtp}`,
    );

    const record = OtpRecord.create({
      email: normalizedEmail,
      purpose: dto.purpose,
      otpHash,
    });
    await this.userRepo.saveOtpRecord(record);

    this.logger.log(`[OTP] Gửi mã tới ${normalizedEmail} [${dto.purpose}]: ${rawOtp}`);

    return Object.freeze({
      email: normalizedEmail,
      purpose: dto.purpose,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
      devOtpPreview: process.env.NODE_ENV !== 'production' ? rawOtp : '',
    });
  }

  /**
   * FR-AUTH-02: Xác thực mã OTP người dùng gửi lên
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    await this.verifyAndConsumeOtp(normalizedEmail, dto.purpose, dto.otpCode);

    return Object.freeze({
      verified: true,
      email: normalizedEmail,
      purpose: dto.purpose,
    });
  }

  /**
   * FR-AUTH-03: Quên mật khẩu - gửi OTP đặt lại mật khẩu
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);

    // Chống User Enumeration: Nếu email không tồn tại vẫn trả thông điệp thành công chung chung
    if (!user) {
      this.logger.warn(`[ForgotPassword] Yêu cầu từ email không tồn tại: ${normalizedEmail}`);
      return Object.freeze({
        email: normalizedEmail,
        purpose: 'RESET_PASSWORD',
        expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
        cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
        message: 'Nếu email tồn tại trong hệ thống, mã OTP đặt lại mật khẩu đã được gửi',
        devOtpPreview: '',
      });
    }

    return this.sendOtp({
      email: normalizedEmail,
      purpose: 'RESET_PASSWORD',
    });
  }

  /**
   * FR-AUTH-03 & FR-AUTH-04: Đặt lại mật khẩu mới bằng mã OTP hợp lệ
   */
  async resetPassword(dto: ResetPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw DomainException.notFound('Tài khoản người dùng');
    }

    await this.verifyAndConsumeOtp(normalizedEmail, 'RESET_PASSWORD', dto.otpCode);

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    const updatedUser = user.withPasswordReset(newPasswordHash);

    await this.userRepo.update(updatedUser);
    await this.userRepo.revokeAllUserSessions(updatedUser.id, 'PASSWORD_RESET');

    return Object.freeze({
      passwordReset: true,
      email: updatedUser.email,
      sessionVersion: updatedUser.sessionVersion,
    });
  }

  private async verifyAndConsumeOtp(
    normalizedEmail: string,
    purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
    otpCode: string,
  ): Promise<void> {
    const record = await this.userRepo.findOtpRecord(normalizedEmail, purpose);
    if (!record) {
      throw new DomainException(
        ErrorCode.OTP_INVALID,
        'Mã OTP không tồn tại hoặc đã được sử dụng',
        400,
      );
    }

    const candidateHash = this.cryptoService.sha256(
      `${normalizedEmail}:${purpose}:${otpCode.trim()}`,
    );
    const { matched, updatedRecord } = record.verifyAttempt(candidateHash, new Date());

    if (!matched) {
      await this.userRepo.saveOtpRecord(updatedRecord);
      if (updatedRecord.lockedUntil && new Date() < updatedRecord.lockedUntil) {
        throw new DomainException(
          ErrorCode.OTP_LOCKED,
          'Bạn đã nhập sai OTP 5 lần liên tiếp. Chức năng OTP bị khóa trong 15 phút',
          429,
        );
      }
      throw new DomainException(
        ErrorCode.OTP_INVALID,
        `Mã OTP không chính xác (đã thử ${updatedRecord.attempts}/5 lần)`,
        400,
      );
    }

    await this.userRepo.deleteOtpRecord(normalizedEmail, purpose);
  }

  private async issueTokenPair(user: User, familyId: string) {
    const sessionId = crypto.randomUUID();

    // Look up active organization membership if user is an ORGANIZER
    let organizationId: string | undefined;
    if (this.membershipModel && user.role === 'ORGANIZER') {
      const activeMem = await this.membershipModel.findOne({ userId: user.id, status: 'ACTIVE' }).exec();
      if (activeMem) {
        organizationId = activeMem.organizationId;
      }
    }

    const payload: any = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      familyId,
      sessionVersion: user.sessionVersion,
      jti: crypto.randomUUID(),
    };
    if (organizationId) {
      payload.organizationId = organizationId;
    }

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' } as any);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' } as any);
    const tokenHash = this.cryptoService.sha256(refreshToken);

    await this.userRepo.saveSession({
      id: sessionId,
      userId: user.id,
      tokenHash,
      familyId,
      isUsed: false,
      isRevoked: false,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    return Object.freeze({ accessToken, refreshToken });
  }

  private verifyRefreshJwt(token: string): {
    sub: string;
    familyId?: string;
    sessionVersion?: number;
  } {
    try {
      return this.jwtService.verify<{
        sub: string;
        familyId?: string;
        sessionVersion?: number;
      }>(token);
    } catch {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Refresh token không hợp lệ hoặc đã hết hạn',
        401,
      );
    }
  }
}
