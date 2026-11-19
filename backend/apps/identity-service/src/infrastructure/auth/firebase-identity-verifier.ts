import { Injectable } from '@nestjs/common';
import { getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { DomainException, ErrorCode } from '@shared';
import {
  ISocialIdentityVerifier,
  VerifiedSocialIdentity,
} from '../../domain/ports/social-identity-verifier.port';

/**
 * FR-AUTH-02: verifies Firebase ID tokens. Only FIREBASE_PROJECT_ID is needed —
 * verifyIdToken checks signature/issuer/audience with Google's public keys, no service account.
 */
@Injectable()
export class FirebaseIdentityVerifier implements ISocialIdentityVerifier {
  private auth?: Auth;

  async verify(idToken: string): Promise<VerifiedSocialIdentity> {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new DomainException(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Đăng nhập Google/Facebook chưa được cấu hình trên máy chủ (thiếu FIREBASE_PROJECT_ID)',
        503,
      );
    }
    this.auth ??= getAuth(getApps()[0] ?? initializeApp({ projectId }));

    let decoded: Awaited<ReturnType<Auth['verifyIdToken']>>;
    try {
      decoded = await this.auth.verifyIdToken(idToken);
    } catch {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Phiên đăng nhập Google/Facebook không hợp lệ hoặc đã hết hạn',
        401,
      );
    }

    return Object.freeze({
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      provider: decoded.firebase?.sign_in_provider ?? 'unknown',
    });
  }
}
