import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
import { User } from '../../domain/user.entity';
import { Passport } from '../../domain/passport.entity';
import { RegisterDto, LoginDto, RefreshTokenDto } from '../dtos/auth.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class AuthUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PASSPORT_REPOSITORY) private readonly passportRepo: IPassportRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ userId: string; email: string }> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Email đã được sử dụng', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);
    const userId = crypto.randomUUID();

    const user = new User(userId, {
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      role: dto.role,
      status: 'ACTIVE',
    });

    await this.userRepo.save(user);

    if (dto.role === 'STUDENT') {
      const passport = new Passport(crypto.randomUUID(), {
        studentId: userId,
        profileVersion: 1,
        fullName: dto.fullName,
        isLookingForTeammate: false,
        isOpenForScholarship: false,
        isOpenForMentoring: false,
        completionScore: 10,
      });
      await this.passportRepo.save(passport);
    }

    return { userId, email: dto.email };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) {
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Email hoặc mật khẩu không đúng', 401);
    }

    if (user.status === 'BLOCKED') {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Tài khoản đã bị khóa', 403);
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Email hoặc mật khẩu không đúng', 401);
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: crypto.randomUUID(),
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = this.jwtService.verify(dto.refreshToken);
      const user = await this.userRepo.findById(decoded.sub);
      if (!user || user.status === 'BLOCKED') {
        throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Phiên đăng nhập không hợp lệ', 401);
      }

      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        sessionId: crypto.randomUUID(),
      };

      return {
        accessToken: this.jwtService.sign(newPayload, { expiresIn: '15m' }),
        refreshToken: this.jwtService.sign(newPayload, { expiresIn: '7d' }),
      };
    } catch {
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Refresh token không hợp lệ hoặc đã hết hạn', 401);
    }
  }
}
