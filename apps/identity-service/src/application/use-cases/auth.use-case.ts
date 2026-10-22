import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
import { User } from '../../domain/user.entity';
import { Passport } from '../../domain/passport.entity';
import { RegisterDto, LoginDto, RefreshTokenDto } from '../dtos/auth.dto';
import { DomainException, ErrorCode, CryptoService } from '@shared';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthUseCase {
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
      throw DomainException.conflict(ErrorCode.STATE_CONFLICT, 'Email đã được sử dụng');
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

    await this.userRepo.markSessionUsed(session.id);
    return this.issueTokenPair(user, session.familyId);
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.userRepo.markSessionUsed(sessionId);
    }
    return Object.freeze({ revoked: true, userId });
  }

  private async issueTokenPair(user: User, familyId: string) {
    const sessionId = crypto.randomUUID();
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      familyId,
      jti: crypto.randomUUID(),
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
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

  private verifyRefreshJwt(token: string): { sub: string; familyId?: string } {
    try {
      return this.jwtService.verify<{ sub: string; familyId?: string }>(token);
    } catch {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Refresh token không hợp lệ hoặc đã hết hạn',
        401,
      );
    }
  }
}
