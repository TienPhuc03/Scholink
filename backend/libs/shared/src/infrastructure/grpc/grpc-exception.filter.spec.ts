import { ArgumentsHost } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { GrpcExceptionFilter } from './grpc-exception.filter';
import { DomainException, ErrorCode } from '../../domain/domain.exception';
import { GlobalExceptionFilter } from '../filters/http-exception.filter';

function httpHost() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  const req = { url: '/api/v1/opportunities/x/external-mark', method: 'POST', headers: {} };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('GrpcExceptionFilter on controllers that also serve HTTP', () => {
  it('answers an HTTP request with the mapped status instead of leaving it hanging', () => {
    const { host, res } = httpHost();
    new GrpcExceptionFilter().catch(
      DomainException.conflict(ErrorCode.STATE_CONFLICT, 'Chỉ cơ hội EXTERNAL mới hỗ trợ'),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalled();
  });

  it('answers 404 for a missing resource over HTTP', () => {
    const { host, res } = httpHost();
    new GrpcExceptionFilter().catch(DomainException.notFound('Cơ hội'), host);
    expect(res.statusCode).toBe(404);
  });

  it('a downstream error forwarded by the gateway keeps its code and message', () => {
    const { host, res } = httpHost();
    const { HttpException } = require('@nestjs/common');
    new GlobalExceptionFilter().catch(
      new HttpException({ error: { code: 'VALIDATION_ERROR', message: 'Không thể công bố: thiếu registerDeadline' } }, 400),
      host,
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toContain('thiếu registerDeadline');
  });

  it('keeps the serialized RpcException for gRPC calls', async () => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    await expect(lastValueFrom(new GrpcExceptionFilter().catch(DomainException.notFound('Cơ hội'), host))).rejects.toMatchObject({
      message: expect.stringContaining('"statusCode":404'),
    });
  });

  it('forwards the domain error of a downstream gRPC service instead of a 500', async () => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const payload = JSON.stringify({
      isDomainException: true,
      code: 'SNAPSHOT_STALE',
      message: 'Hồ sơ đã thay đổi',
      statusCode: 409,
    });
    const serviceError = Object.assign(new Error(`2 UNKNOWN: ${payload}`), { code: 2, details: payload });

    await expect(lastValueFrom(new GrpcExceptionFilter().catch(serviceError, host))).rejects.toMatchObject({
      message: payload,
    });
  });

  it('still scrubs a gRPC error that carries no domain payload', async () => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const serviceError = Object.assign(new Error('14 UNAVAILABLE'), { code: 14, details: 'No connection established' });

    await expect(lastValueFrom(new GrpcExceptionFilter().catch(serviceError, host))).rejects.toMatchObject({
      message: expect.stringContaining('INTERNAL_ERROR'),
    });
  });
});
