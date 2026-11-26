import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CryptoService,
  DomainException,
  IdempotencyGuard,
  JwtAuthGuard,
  RateLimitGuard,
  ROLES_KEY,
  RolesGuard,
  validateEnv,
} from '@shared';
import { GrpcGatewayController } from './grpc-gateway.controller';
import { isInternalOnlyPath, ReverseProxyMiddleware } from './proxy.middleware';

describe('Gateway & Shared Security Audit Regression Suite', () => {
  describe('#3 ReverseProxyMiddleware path normalization', () => {
    it('blocks dot-segment and encoded traversal attempts to notification internal routes', () => {
      expect(isInternalOnlyPath('/api/v1/notifications/transactional')).toBe(true);
      expect(isInternalOnlyPath('/api/v1/notifications/x/../transactional')).toBe(true);
      expect(isInternalOnlyPath('/api/v1/notifications/%2e%2e/notifications/reminders?userId=u2')).toBe(true);
      expect(isInternalOnlyPath('/api/v1/notifications/x/%2e%2e/events/bookmark-created')).toBe(true);
      expect(isInternalOnlyPath('/api/v1/notifications//transactional')).toBe(true);
    });

    it('allows legitimate client notification paths', () => {
      expect(isInternalOnlyPath('/api/v1/notifications')).toBe(false);
      expect(isInternalOnlyPath('/api/v1/notifications/read-all')).toBe(false);
      expect(isInternalOnlyPath('/api/v1/notifications/notif_123/read')).toBe(false);
    });
  });

  describe('#2 GrpcGatewayController authentication & authorization', () => {
    it('protects controller with JwtAuthGuard and RolesGuard', () => {
      const guards = Reflect.getMetadata('__guards__', GrpcGatewayController);
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, GrpcGatewayController.prototype.prepareSubmissionViaGrpc)).toEqual(['STUDENT']);
      expect(Reflect.getMetadata(ROLES_KEY, GrpcGatewayController.prototype.getStudentSnapshotViaGrpc)).toEqual(['STUDENT', 'ADMIN']);
    });

    it('uses authenticated userId for prepareSubmissionViaGrpc and blocks reading another student snapshot', async () => {
      const { of } = await import('rxjs');
      const collabSvc = { prepareSubmission: jest.fn(() => of({ ok: true })), getTeamDetails: jest.fn(() => of({})) };
      const idSvc = { getProfileSnapshot: jest.fn(() => of({ snapshotId: 's1' })) };
      const controller = new GrpcGatewayController(
        { getService: () => collabSvc } as any,
        { getService: () => idSvc } as any,
      );
      controller.onModuleInit();

      await controller.prepareSubmissionViaGrpc(
        { user: { userId: 'stu_real', email: 'a@b.c', role: 'STUDENT' } },
        'team_1',
        { competitionId: 'comp_1' },
      );
      expect(collabSvc.prepareSubmission).toHaveBeenCalledWith(
        expect.objectContaining({ leader_id: 'stu_real' }),
      );

      await expect(
        controller.getStudentSnapshotViaGrpc(
          { user: { userId: 'stu_real', email: 'a@b.c', role: 'STUDENT' } },
          'stu_other',
        ),
      ).rejects.toThrow(DomainException);
    });
  });

  describe('#5 RateLimitGuard ignores spoofed X-Forwarded-For & #15 proxy enforces rate limit', () => {
    it('tracks limits by verified request.ip rather than client-supplied X-Forwarded-For', async () => {
      const guard = new RateLimitGuard(new Reflector());
      const headers = new Map<string, unknown>();
      const makeRes = () => ({ setHeader: (k: string, v: unknown) => headers.set(k, v) }) as any;

      for (let i = 0; i < 3; i++) {
        const req = {
          ip: '203.0.113.55',
          headers: { 'x-forwarded-for': `198.51.100.${i + 1}` },
          path: '/api/v1/auth/login',
          socket: { remoteAddress: '203.0.113.55' },
        } as any;
        await expect(guard.consumeRequest(req, makeRes(), { limit: 3, windowSeconds: 60 })).resolves.toBe(true);
      }

      const fourthReq = {
        ip: '203.0.113.55',
        headers: { 'x-forwarded-for': '198.51.100.99' },
        path: '/api/v1/auth/login',
        socket: { remoteAddress: '203.0.113.55' },
      } as any;
      await expect(guard.consumeRequest(fourthReq, makeRes(), { limit: 3, windowSeconds: 60 })).rejects.toThrow(
        DomainException,
      );
    });

    it('returns 429 in ReverseProxyMiddleware when rate limit rejects before proxying', async () => {
      const mockGuard = {
        consumeRequest: jest.fn().mockRejectedValue(new DomainException('TOO_MANY_REQUESTS' as any, 'Limit reached', 429)),
      } as unknown as RateLimitGuard;
      const middleware = new ReverseProxyMiddleware(mockGuard);

      const statusMock = jest.fn().mockReturnThis();
      const jsonMock = jest.fn();
      const req = {
        originalUrl: '/api/v1/teams',
        headers: {},
        readableEnded: true,
        pause: jest.fn(),
        resume: jest.fn(),
      } as any;
      const res = { status: statusMock, json: jsonMock } as any;
      const next = jest.fn();

      await middleware.use(req, res, next);
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'TOO_MANY_REQUESTS' }) }));
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('#9 IdempotencyGuard atomic lock on concurrent identical requests', () => {
    it('allows only one request to execute when two concurrent requests share the same Idempotency-Key', async () => {
      const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
      const guard = new IdempotencyGuard(reflector);

      const makeCtx = () => {
        const req = {
          headers: { 'idempotency-key': `idem-${Date.now()}-${Math.random()}` },
          method: 'POST',
          baseUrl: '/api/v1',
          path: '/wallet/purchases',
          body: { skuCode: 'PLUS_1_MONTH' },
          user: { userId: 'usr_idem_race' },
        } as any;
        const res = {
          statusCode: 200,
          setHeader: jest.fn(),
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        } as any;
        return {
          switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
          getHandler: () => ({}),
          getClass: () => ({}),
        } as unknown as ExecutionContext;
      };

      const sharedKey = `idem-race-${Date.now()}`;
      const ctx1 = makeCtx();
      const ctx2 = makeCtx();
      (ctx1.switchToHttp().getRequest() as any).headers['idempotency-key'] = sharedKey;
      (ctx2.switchToHttp().getRequest() as any).headers['idempotency-key'] = sharedKey;

      const results = await Promise.allSettled([guard.canActivate(ctx1), guard.canActivate(ctx2)]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });
  });

  describe('#13 Secret validation & CryptoService key requirement', () => {
    it('rejects .env.example default secrets in validateEnv', () => {
      expect(() =>
        validateEnv({
          JWT_SECRET: 'scholink-super-secret-jwt-key-minimum-32-chars-long!',
          ENCRYPTION_KEY: 'scholink-pii-secret-encryption-key-32ch!',
        }),
      ).toThrow();
    });

    it('throws in CryptoService when ENCRYPTION_KEY is missing outside test environment', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevKey = process.env.ENCRYPTION_KEY;
      process.env.NODE_ENV = 'production';
      delete process.env.ENCRYPTION_KEY;
      try {
        expect(() => new CryptoService()).toThrow(/ENCRYPTION_KEY/);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevKey !== undefined) process.env.ENCRYPTION_KEY = prevKey;
      }
    });
  });
});
