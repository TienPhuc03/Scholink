import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { DomainException, ErrorCode } from '../../domain/domain.exception';

export const IDEMPOTENT_KEY = 'idempotent';
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ theo SRS BR13

interface IdempotentEntry {
  readonly status: 'PROCESSING' | 'COMPLETED';
  readonly requestHash: string;
  readonly responseBody?: unknown;
  readonly statusCode?: number;
  readonly createdAt: number;
}

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private static readonly cache = new Map<string, IdempotentEntry>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    IdempotencyGuard.evictExpiredEntries();

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

    const rawBody = JSON.stringify(request.body || {});
    const requestHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    const existing = IdempotencyGuard.cache.get(scopeKey);

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

    IdempotencyGuard.cache.set(
      scopeKey,
      Object.freeze({
        status: 'PROCESSING',
        requestHash,
        createdAt: Date.now(),
      }),
    );

    const originalJson = response.json.bind(response);
    response.json = (body: unknown) => {
      if (response.statusCode >= 500) {
        // Nhả khóa nếu gặp lỗi hệ thống 5xx để client có thể retry hợp lệ
        IdempotencyGuard.cache.delete(scopeKey);
      } else {
        IdempotencyGuard.cache.set(
          scopeKey,
          Object.freeze({
            status: 'COMPLETED',
            requestHash,
            responseBody: body,
            statusCode: response.statusCode,
            createdAt: Date.now(),
          }),
        );
      }
      return originalJson(body);
    };

    return true;
  }

  private static evictExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of IdempotencyGuard.cache.entries()) {
      if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) {
        IdempotencyGuard.cache.delete(key);
      }
    }
  }
}
