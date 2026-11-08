import { Catch, RpcExceptionFilter, ArgumentsHost, Logger } from '@nestjs/common';
import { EMPTY, Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { DomainException, ErrorCode } from '../../domain/domain.exception';
import { GlobalExceptionFilter } from '../filters/http-exception.filter';

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
  private readonly httpFilter = new GlobalExceptionFilter();

  /**
   * This filter is put on controllers that serve BOTH gRPC methods and HTTP routes. On an HTTP
   * request an Observable error is never turned into a response, so the client hung until its
   * timeout (e.g. 409/404 from POST /opportunities/:id/external-mark). HTTP errors therefore go
   * through the normal HTTP error mapping; gRPC keeps the serialized RpcException.
   */
  catch(exception: unknown, host: ArgumentsHost): Observable<never> {
    if (host.getType() === 'http') {
      this.httpFilter.catch(exception, host);
      return EMPTY as Observable<never>;
    }

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
