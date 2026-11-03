import { Injectable, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  DataDeletionTrackingRecord,
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/ports/user.repository.port';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
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
  RequestAccountDeletionDto,
} from '../dtos/auth.dto';
import { DomainException, ErrorCode, CryptoService } from '@shared';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DELETION_RETENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthUseCase {
  private readonly logger = new Logger(AuthUseCase.name);
  private readonly fallbackTrackings = new Map<string, DataDeletionTrackingRecord>();

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PASSPORT_REPOSITORY) private readonly passportRepo: IPassportRepository,
    private readonly jwtService: JwtService,
    private readonly cryptoService: CryptoService,
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

    return Object.freeze({
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
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

    // Kiểm tra sessionVersion: nếu user đã đổi/đặt lại mật khẩu hoặc xóa tài khoản thì token cũ lập tức mất hiệu lực
    if (decoded.sessionVersion !== undefined && decoded.sessionVersion !== user.sessionVersion) {
      await this.userRepo.revokeSessionFamily(session.familyId, 'SESSION_VERSION_MISMATCH');
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Mật khẩu hoặc quyền tài khoản đã thay đổi, vui lòng đăng nhập lại',
        401,
      );
    }

    await this.userRepo.markSessionUsed(session.id);
    return this.issueTokenPair(user, session.familyId);
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.userRepo.markSessionUsed(sessionId);
    }
    return Object.freeze({ revoked: true, userId });
  }

  /**
   * FR-AUTH-02 & FR-AUTH-03: Sinh mã OTP 6 chữ số bằng CSPRNG, băm SHA-256 trước khi lưu DB.
   * Áp dụng cooldown 60 giây giữa 2 lần gửi và khóa 15 phút nếu đang trong thời gian bị phạt.
   */
  async sendOtp(dto: SendOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const now = new Date();

    const existingRecord = await this.userRepo.findOtpRecord(normalizedEmail, dto.purpose);
    if (existingRecord) {
      existingRecord.assertCanResend(now);
    }

    const rawOtp = String(crypto.randomInt(100000, 1000000));
    const otpHash = this.cryptoService.sha256(`${normalizedEmail}:${dto.purpose}:${rawOtp}`);

    const newRecord = OtpRecord.issueNew({
      email: normalizedEmail,
      purpose: dto.purpose,
      otpHash,
      now,
    });
    await this.userRepo.saveOtpRecord(newRecord);

    const isDevOrTest = process.env.NODE_ENV !== 'production';
    if (isDevOrTest) {
      this.logger.log(`[OTP-${dto.purpose}] Email=${normalizedEmail} OTP=${rawOtp} (TTL=300s)`);
    }

    return Object.freeze({
      sent: true,
      email: normalizedEmail,
      purpose: dto.purpose,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
      message: 'Mã OTP đã được phát hành và gửi tới email của bạn',
      devOtpPreview: isDevOrTest ? rawOtp : '',
    });
  }

  /**
   * FR-AUTH-02: Xác thực mã OTP (tối đa 5 lần sai -> khóa 15 phút).
   * Nếu purpose === 'VERIFY_EMAIL', kích hoạt trạng thái tài khoản sang ACTIVE.
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    await this.verifyAndConsumeOtp(normalizedEmail, dto.purpose, dto.otpCode);

    let status = 'VERIFIED';
    if (dto.purpose === 'VERIFY_EMAIL') {
      const user = await this.userRepo.findByEmail(normalizedEmail);
      if (user) {
        if (user.status === 'DELETED' || user.status === 'BLOCKED') {
          throw DomainException.forbidden('Tài khoản đã bị xóa hoặc khóa, không thể kích hoạt');
        }
        const activated = user.activate();
        await this.userRepo.update(activated);
        status = activated.status;
      }
    }

    return Object.freeze({
      verified: true,
      email: normalizedEmail,
      purpose: dto.purpose,
      status,
    });
  }

  /**
   * FR-AUTH-03: Yêu cầu đặt lại mật khẩu (Chống dò email / Anti-Enumeration).
   * Nếu email không tồn tại, vẫn trả về thông báo thành công đồng nhất để không lộ danh sách tài khoản.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);

    if (!user || user.status === 'DELETED') {
      return Object.freeze({
        sent: true,
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
   * FR-AUTH-03 & FR-AUTH-04: Đặt lại mật khẩu mới bằng mã OTP hợp lệ,
   * tăng `sessionVersion` và thu hồi toàn bộ các phiên Refresh Token cũ của người dùng.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw DomainException.notFound('Tài khoản người dùng');
    }
    if (user.status === 'DELETED' || user.status === 'BLOCKED') {
      throw DomainException.forbidden('Tài khoản đã bị xóa hoặc khóa, không thể đặt lại mật khẩu');
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

  /**
   * F40 Backend — FR-AUTH-08, Mục 28, Mục 29, D06 & E13 SRS:
   * Xử lý yêu cầu xóa tài khoản:
   * 1. Xác thực lại mật khẩu hiện tại của người dùng.
   * 2. Chuyển trạng thái User sang DELETED và tăng sessionVersion ngay lập tức.
   * 3. Thu hồi toàn bộ phiên Refresh Token hiện có (revokeAllUserSessions) và dọn OTP tồn đọng.
   * 4. Tạo bản ghi theo dõi xóa dữ liệu cá nhân (trackingId) với hạn 30 ngày theo Mục 29, cam kết không xóa sổ cái (ledgerPreserved = true).
   * 5. Phát sự kiện Outbox `user.deleted` để các service hạ nguồn dừng quyền truy cập và xử lý snapshot theo quyết định.
   */
  async requestAccountDeletion(userId: string, dto: RequestAccountDeletionDto) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw DomainException.notFound('Tài khoản người dùng');
    }

    if (user.status === 'DELETED') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Tài khoản này đã được xác nhận xóa trước đó',
      );
    }

    const isPasswordMatched = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isPasswordMatched) {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Mật khẩu xác thực lại không chính xác',
        401,
      );
    }

    const deletedUser = user.markDeleted();
    await this.userRepo.update(deletedUser);
    await this.userRepo.revokeAllUserSessions(deletedUser.id, 'ACCOUNT_DELETED');
    await Promise.all([
      this.userRepo.deleteOtpRecord(deletedUser.normalizedEmail, 'VERIFY_EMAIL'),
      this.userRepo.deleteOtpRecord(deletedUser.normalizedEmail, 'RESET_PASSWORD'),
    ]);

    const now = new Date();
    const snapshotDecision = dto.snapshotDecision ?? 'RETAIN';
    const trackingRecord: DataDeletionTrackingRecord = Object.freeze({
      trackingId: `del_${crypto.randomUUID()}`,
      userId: deletedUser.id,
      status: snapshotDecision === 'RETAIN' ? 'RETAINED_BY_POLICY' : 'SCHEDULED_PURGE',
      snapshotDecision,
      revokedSessionVersion: deletedUser.sessionVersion,
      sessionsRevoked: true,
      ledgerPreserved: true,
      scheduledPurgeAt: new Date(now.getTime() + DELETION_RETENTION_WINDOW_MS),
      requestedAt: now,
      reason: dto.reason,
    });

    if (this.userRepo.saveDeletionTracking) {
      await this.userRepo.saveDeletionTracking(trackingRecord);
    }
    this.fallbackTrackings.set(trackingRecord.trackingId, trackingRecord);

    if (this.userRepo.saveOutboxEvent) {
      await this.userRepo.saveOutboxEvent({
        eventId: `out_${crypto.randomUUID()}`,
        type: 'user.deleted',
        occurredAt: now,
        producer: 'identity-service',
        aggregateId: deletedUser.id,
        aggregateVersion: deletedUser.version,
        correlationId: trackingRecord.trackingId,
        data: {
          userId: deletedUser.id,
          trackingId: trackingRecord.trackingId,
          snapshotDecision: trackingRecord.snapshotDecision,
          revokedSessionVersion: deletedUser.sessionVersion,
          ledgerPreserved: true,
          scheduledPurgeAt: trackingRecord.scheduledPurgeAt.toISOString(),
        },
      });
    }

    return Object.freeze({
      trackingId: trackingRecord.trackingId,
      userId: trackingRecord.userId,
      status: trackingRecord.status,
      snapshotDecision: trackingRecord.snapshotDecision,
      revokedSessionVersion: trackingRecord.revokedSessionVersion,
      sessionsRevoked: trackingRecord.sessionsRevoked,
      ledgerPreserved: trackingRecord.ledgerPreserved,
      scheduledPurgeAt: trackingRecord.scheduledPurgeAt.toISOString(),
      requestedAt: trackingRecord.requestedAt.toISOString(),
      reason: trackingRecord.reason ?? '',
    });
  }

  /**
   * F40 Backend — FR-AUTH-08: Tra cứu trạng thái theo dõi xóa dữ liệu cá nhân theo trackingId.
   */
  async getDeletionTracking(userId: string, trackingId: string) {
    const persisted = this.userRepo.findDeletionTrackingById
      ? await this.userRepo.findDeletionTrackingById(trackingId)
      : null;
    const record = persisted ?? this.fallbackTrackings.get(trackingId) ?? null;

    if (!record) {
      throw DomainException.notFound('Mã theo dõi xóa dữ liệu cá nhân (Deletion Tracking)');
    }

    if (record.userId !== userId) {
      throw DomainException.forbidden(
        'Bạn không có quyền truy cập mã theo dõi xóa dữ liệu của tài khoản khác',
      );
    }

    return Object.freeze({
      trackingId: record.trackingId,
      userId: record.userId,
      status: record.status,
      snapshotDecision: record.snapshotDecision,
      revokedSessionVersion: record.revokedSessionVersion,
      sessionsRevoked: record.sessionsRevoked,
      ledgerPreserved: record.ledgerPreserved,
      scheduledPurgeAt: record.scheduledPurgeAt.toISOString(),
      requestedAt: record.requestedAt.toISOString(),
      reason: record.reason ?? '',
    });
  }

  /**
   * F40 Backend — FR-AUTH-08: Xuất dữ liệu cá nhân (Data Export) an toàn, không lộ passwordHash hoặc secret.
   */
  async exportPersonalData(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw DomainException.notFound('Tài khoản người dùng');
    }

    const [passport, persistedTrackings] = await Promise.all([
      this.passportRepo.findByStudentId(userId),
      this.userRepo.findDeletionTrackingsByUser
        ? this.userRepo.findDeletionTrackingsByUser(userId)
        : Promise.resolve([]),
    ]);

    const trackings =
      persistedTrackings.length > 0
        ? persistedTrackings
        : Array.from(this.fallbackTrackings.values()).filter((t) => t.userId === userId);

    const exportedAt = new Date().toISOString();
    const payload = Object.freeze({
      account: Object.freeze({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        sessionVersion: user.sessionVersion,
      }),
      passport: passport
        ? Object.freeze({
            id: passport.id,
            profileVersion: passport.version,
            fullName: passport.props.fullName,
            bio: passport.props.bio ?? '',
            regionCode: passport.props.regionCode ?? '',
            education: passport.props.education ?? null,
            skills: passport.props.skills ?? [],
            achievements: passport.props.achievements ?? [],
            certificates: passport.props.certificates ?? [],
            completionScore: passport.completionScore,
          })
        : null,
      deletionTrackings: trackings.map((t) =>
        Object.freeze({
          trackingId: t.trackingId,
          status: t.status,
          snapshotDecision: t.snapshotDecision,
          ledgerPreserved: t.ledgerPreserved,
          scheduledPurgeAt: t.scheduledPurgeAt.toISOString(),
          requestedAt: t.requestedAt.toISOString(),
        }),
      ),
      ledgerPolicy: Object.freeze({
        ledgerPreserved: true,
        retentionWindowDays: 30,
      }),
    });

    return Object.freeze({
      exportId: `exp_${crypto.randomUUID()}`,
      userId: user.id,
      exportedAt,
      payloadJson: JSON.stringify(payload),
      payload,
      ledgerPreserved: true,
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
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      familyId,
      sessionVersion: user.sessionVersion,
      jti: crypto.randomUUID(),
    };

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
