import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  Optional,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { DomainException, ErrorCode } from '../../domain/domain.exception';
import { RedisService } from '../redis/redis.service';

export const IDEMPOTENT_KEY = 'idempotent';
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 giờ theo SRS BR13
const PROCESSING_TTL_SECONDS = 120; // 2 phút cho trạng thái PROCESSING

interface IdempotentEntry {
  readonly status: 'PROCESSING' | 'COMPLETED';
  readonly requestHash: string;
  readonly responseBody?: unknown;
  readonly statusCode?: number;
  readonly createdAt: number;
}

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private static readonly memoryCache = new Map<string, IdempotentEntry>();
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    IdempotencyGuard.evictExpiredMemoryEntries();

    const isIdempotentRequired = this.reflector.getAllAndOverride<boolean>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const idempotencyKey = request.headers['idempotency-key'] as string;

    if (!isIdempotentRequired && !idempotencyKey) {
      return true;
    }

    if (isIdempotentRequired && !idempotencyKey) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Header Idempotency-Key là bắt buộc cho thao tác này',
        400,
      );
    }

    const actorId = (request as { user?: { userId?: string } }).user?.userId || 'anonymous';
    const method = request.method;
    const route = request.baseUrl + request.path;
    const scopeKey = `${actorId}:${method}:${route}:${idempotencyKey}`;
    const redisKey = `idemp:${scopeKey}`;

    const rawBody = JSON.stringify(request.body || {});
    const requestHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    // 1. Kiểm tra bản ghi từ Redis hoặc Memory Cache
    const existing = await this.getEntry(redisKey, scopeKey);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new DomainException(
          ErrorCode.IDEMPOTENCY_CONFLICT,
          'Cùng Idempotency-Key nhưng payload request khác nhau',
          409,
        );
      }

      if (existing.status === 'PROCESSING') {
        response.setHeader('Retry-After', '2');
        throw new DomainException(
          ErrorCode.REQUEST_IN_PROGRESS,
          'Yêu cầu đang được xử lý, vui lòng thử lại sau giây lát',
          409,
        );
      }

      if (existing.status === 'COMPLETED') {
        response.status(existing.statusCode || 200).json(existing.responseBody);
        return false;
      }
    }

    // 2. Ghi nhận trạng thái PROCESSING
    const processingEntry: IdempotentEntry = {
      status: 'PROCESSING',
      requestHash,
      createdAt: Date.now(),
    };
    await this.setEntry(redisKey, scopeKey, processingEntry, PROCESSING_TTL_SECONDS);

    // 3. Chặn và ghi nhận kết quả phản hồi cuối cùng
    const originalJson = response.json.bind(response);
    response.json = (body: unknown) => {
      if (response.statusCode >= 500) {
        // Nhả khóa nếu gặp lỗi hệ thống 5xx để client có thể retry hợp lệ
        this.deleteEntry(redisKey, scopeKey);
      } else {
        const completedEntry: IdempotentEntry = {
          status: 'COMPLETED',
          requestHash,
          responseBody: body,
          statusCode: response.statusCode,
          createdAt: Date.now(),
        };
        this.setEntry(redisKey, scopeKey, completedEntry, IDEMPOTENCY_TTL_SECONDS);
      }
      return originalJson(body);
    };

    return true;
  }

  private async getEntry(redisKey: string, scopeKey: string): Promise<IdempotentEntry | null> {
    if (this.redisService?.isAvailable) {
      try {
        const raw = await this.redisService.get(redisKey);
        if (raw) {
          return JSON.parse(raw) as IdempotentEntry;
        }
      } catch (err: any) {
        this.logger.debug(`Lỗi đọc Redis idempotency: ${err.message}`);
      }
    }
    return IdempotencyGuard.memoryCache.get(scopeKey) || null;
  }

  private async setEntry(
    redisKey: string,
    scopeKey: string,
    entry: IdempotentEntry,
    ttlSeconds: number,
  ): Promise<void> {
    if (this.redisService?.isAvailable) {
      try {
        await this.redisService.set(redisKey, JSON.stringify(entry), ttlSeconds);
        return;
      } catch (err: any) {
        this.logger.debug(`Lỗi ghi Redis idempotency: ${err.message}`);
      }
    }
    IdempotencyGuard.memoryCache.set(scopeKey, Object.freeze(entry));
  }

  private async deleteEntry(redisKey: string, scopeKey: string): Promise<void> {
    if (this.redisService?.isAvailable) {
      try {
        await this.redisService.del(redisKey);
      } catch {}
    }
    IdempotencyGuard.memoryCache.delete(scopeKey);
  }

  private static evictExpiredMemoryEntries(): void {
    const now = Date.now();
    for (const [key, entry] of IdempotencyGuard.memoryCache.entries()) {
      if (now - entry.createdAt > IDEMPOTENCY_TTL_SECONDS * 1000) {
        IdempotencyGuard.memoryCache.delete(key);
      }
    }
  }
}
