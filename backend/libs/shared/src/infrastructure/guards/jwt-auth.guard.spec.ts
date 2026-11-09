import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RedisService } from '../redis/redis.service';

describe('JwtAuthGuard account-wide revocation', () => {
  const jwt = new JwtService({ secret: 'test-jwt-secret-key-32-chars-long-min' });
  const nowSeconds = 1_800_000_000;

  const tokenIssuedAt = (iat: number, typ = 'access') =>
    jwt.sign({ sub: 'u1', email: 'a@b.vn', role: 'STUDENT', familyId: 'fam1', iat, typ });

  const contextFor = (token: string) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
      }),
    }) as unknown as ExecutionContext;

  const guardWithRevocation = (revokedBefore: string | null, familyRevoked = false) => {
    const redis = {
      isAvailable: true,
      get: jest.fn(async (key: string) => {
        if (key === 'revoked_family:fam1') return familyRevoked ? 'USER_LOGOUT' : null;
        return key === 'revoked_before:u1' ? revokedBefore : null;
      }),
    } as unknown as RedisService;
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    return new JwtAuthGuard(reflector, jwt, redis);
  };

  beforeEach(() => jest.useFakeTimers({ now: (nowSeconds + 60) * 1000 }));
  afterEach(() => jest.useRealTimers());

  it('rejects a token issued before the sessions were revoked', async () => {
    const guard = guardWithRevocation(String(nowSeconds));
    await expect(guard.canActivate(contextFor(tokenIssuedAt(nowSeconds - 10)))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('accepts a token from a login after the revocation', async () => {
    const guard = guardWithRevocation(String(nowSeconds));
    await expect(guard.canActivate(contextFor(tokenIssuedAt(nowSeconds + 5)))).resolves.toBe(true);
  });

  it('accepts a login in the same second as the revocation', async () => {
    const guard = guardWithRevocation(String(nowSeconds));
    await expect(guard.canActivate(contextFor(tokenIssuedAt(nowSeconds)))).resolves.toBe(true);
  });

  it('rejects a refresh token used as a bearer token', async () => {
    const guard = guardWithRevocation(null);
    await expect(guard.canActivate(contextFor(tokenIssuedAt(nowSeconds, 'refresh')))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('rejects an access token after its session family was logged out', async () => {
    const guard = guardWithRevocation(null, true);
    await expect(guard.canActivate(contextFor(tokenIssuedAt(nowSeconds)))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('accepts any token when the account has no revocation', async () => {
    const guard = guardWithRevocation(null);
    await expect(guard.canActivate(contextFor(tokenIssuedAt(nowSeconds - 10)))).resolves.toBe(true);
  });
});
