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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request as any).correlationId ||
      `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode | string = ErrorCode.INTERNAL_ERROR;
    let message = 'Đã xảy ra lỗi nội bộ trong hệ thống';
    let details: any[] | undefined = undefined;

    if (exception instanceof DomainException) {
      statusCode = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const anyRes = res as any;
        code = anyRes.code || anyRes.error || this.mapStatusToCode(statusCode);
        message = anyRes.message || exception.message;
        details = anyRes.details;
      } else {
        message = String(res);
        code = this.mapStatusToCode(statusCode);
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
      message = exception.message;
    }

    response.status(statusCode).json({
      error: {
        code,
        message,
        details,
        correlationId,
      },
    });
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
