import { Catch, RpcExceptionFilter, ArgumentsHost, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { DomainException, ErrorCode } from '../../domain/domain.exception';

export interface SerializedRpcError {
  readonly isDomainException: true;
  readonly code: ErrorCode | string;
  readonly message: string;
  readonly statusCode: number;
  readonly details?: readonly unknown[];
}

@Catch()
export class GrpcExceptionFilter implements RpcExceptionFilter<unknown> {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  catch(exception: unknown, _host: ArgumentsHost): Observable<never> {
    if (exception instanceof DomainException) {
      const payload: SerializedRpcError = {
        isDomainException: true,
        code: exception.code,
        message: exception.message,
        statusCode: exception.statusCode,
        details: exception.details,
      };
      return throwError(() => new RpcException(JSON.stringify(payload)));
    }

    if (exception instanceof RpcException) {
      return throwError(() => exception);
    }

    const internalMessage =
      exception instanceof Error ? exception.message : 'Unknown gRPC service error';
    const internalStack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(`Unhandled gRPC error: ${internalMessage}`, internalStack);

    const scrubbedPayload: SerializedRpcError = {
      isDomainException: true,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Đã xảy ra lỗi nội bộ trong hệ thống',
      statusCode: 500,
    };
    return throwError(() => new RpcException(JSON.stringify(scrubbedPayload)));
  }
}
