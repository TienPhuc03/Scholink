import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { DomainException, ErrorCode } from '../../domain/domain.exception';
import { RedisService } from '../redis/redis.service';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate_limit_options';
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

// In-memory fallback if Redis is unavailable
const memoryRateMap = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale memory rate map keys every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryRateMap.entries()) {
    if (now > value.resetAt) {
      memoryRateMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultLimit = 120; // 120 requests
  private readonly defaultWindowSeconds = 60; // per 1 minute

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService?: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) || {
      limit: this.defaultLimit,
      windowSeconds: this.defaultWindowSeconds,
    };

    // Client identifier: Authenticated user ID, or client IP, or forwarded IP
    const user = (request as any).user;
    const clientIp =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      'anonymous';

    const identifier = user?.userId ? `usr:${user.userId}` : `ip:${clientIp}`;
    const endpoint = request.route?.path || request.path || 'all';
    const rateKey = `rate:${identifier}:${endpoint}`;

    let currentCount = 0;
    let ttlSeconds = options.windowSeconds;

    // 1. Try Redis rate limiting
    if (this.redisService?.isAvailable) {
      try {
        const raw = await this.redisService.get(rateKey);
        if (raw) {
          currentCount = parseInt(raw, 10) + 1;
          await this.redisService.set(rateKey, currentCount.toString(), options.windowSeconds);
        } else {
          currentCount = 1;
          await this.redisService.set(rateKey, '1', options.windowSeconds);
        }
      } catch {
        // Fallback to in-memory on redis error
        currentCount = this.checkInMemory(rateKey, options);
      }
    } else {
      currentCount = this.checkInMemory(rateKey, options);
    }

    // Set rate limit headers
    if (response && typeof response.setHeader === 'function') {
      response.setHeader('X-RateLimit-Limit', options.limit);
      response.setHeader('X-RateLimit-Remaining', Math.max(0, options.limit - currentCount));
    }

    if (currentCount > options.limit) {
      if (response && typeof response.setHeader === 'function') {
        response.setHeader('Retry-After', options.windowSeconds);
      }
      throw new DomainException(
        ErrorCode.TOO_MANY_REQUESTS,
        `Bạn đã gửi quá nhiều yêu cầu vượt quá định mức cho phép (${options.limit} yêu cầu/${options.windowSeconds}s). Vui lòng thử lại sau.`,
        429,
      );
    }

    return true;
  }

  private checkInMemory(rateKey: string, options: RateLimitOptions): number {
    const now = Date.now();
    const existing = memoryRateMap.get(rateKey);

    if (!existing || now > existing.resetAt) {
      memoryRateMap.set(rateKey, {
        count: 1,
        resetAt: now + options.windowSeconds * 1000,
      });
      return 1;
    }

    existing.count += 1;
    return existing.count;
  }
}
