import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { DomainException, ErrorCode } from '../../domain/domain.exception';
import { SerializedRpcError } from '../grpc/grpc-exception.filter';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request as unknown as { correlationId?: string }).correlationId ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const resolved = this.resolveError(exception, correlationId);

    response.status(resolved.statusCode).json({
      error: {
        code: resolved.code,
        message: resolved.message,
        details: resolved.details,
        correlationId,
      },
    });
  }

  private resolveError(
    exception: unknown,
    correlationId: string,
  ): {
    statusCode: number;
    code: ErrorCode | string;
    message: string;
    details?: readonly unknown[];
  } {
    if (exception instanceof DomainException) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    const rpcDecoded = this.tryParseGrpcError(exception);
    if (rpcDecoded) {
      return rpcDecoded;
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const anyRes = res as Record<string, unknown>;
        return {
          statusCode,
          code: (anyRes.code as string) || this.mapStatusToCode(statusCode),
          message: (anyRes.message as string) || exception.message,
          details: Array.isArray(anyRes.details) ? anyRes.details : undefined,
        };
      }
      return {
        statusCode,
        code: this.mapStatusToCode(statusCode),
        message: String(res),
      };
    }

    if (exception instanceof Error) {
      this.logger.error(
        `[${correlationId}] Unhandled internal error: ${exception.message}`,
        exception.stack,
      );
    }

    // Security Checklist: Scrub all internal/database errors before returning to client
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Đã xảy ra lỗi nội bộ trong hệ thống',
    };
  }

  private tryParseGrpcError(exception: unknown): {
    statusCode: number;
    code: ErrorCode | string;
    message: string;
    details?: readonly unknown[];
  } | null {
    if (!exception || typeof exception !== 'object') {
      return null;
    }

    const errObj = exception as { details?: unknown; message?: unknown; code?: unknown };
    const candidates = [errObj.details, errObj.message];

    for (const raw of candidates) {
      if (typeof raw !== 'string') continue;
      const jsonStart = raw.indexOf('{');
      if (jsonStart === -1) continue;

      try {
        const parsed = JSON.parse(raw.slice(jsonStart)) as Partial<SerializedRpcError>;
        if (parsed && parsed.isDomainException && parsed.code && parsed.message) {
          return {
            statusCode: parsed.statusCode || HttpStatus.BAD_REQUEST,
            code: parsed.code,
            message: parsed.message,
            details: parsed.details,
          };
        }
      } catch {
        // Ignore non-JSON gRPC error string
      }
    }

    // Handle gRPC UNAVAILABLE (status code 14) when downstream service is offline
    if (errObj.code === 14) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.UPSTREAM_UNAVAILABLE,
        message: 'Dịch vụ xử lý nghiệp vụ hiện không khả dụng, vui lòng thử lại sau',
      };
    }

    return null;
  }

  private mapStatusToCode(status: number): ErrorCode {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_ERROR;
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 403:
        return ErrorCode.FORBIDDEN_RESOURCE;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.STATE_CONFLICT;
      case 410:
        return ErrorCode.PREVIEW_EXPIRED;
      case 422:
        return ErrorCode.PROFILE_INCOMPLETE;
      case 429:
        return ErrorCode.RATE_LIMITED;
      case 503:
        return ErrorCode.UPSTREAM_UNAVAILABLE;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
