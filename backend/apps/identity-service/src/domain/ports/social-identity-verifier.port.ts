export const SOCIAL_IDENTITY_VERIFIER = Symbol('SOCIAL_IDENTITY_VERIFIER');

/** Identity proven by a social provider (Google/Facebook) through Firebase Auth. */
export interface VerifiedSocialIdentity {
  readonly uid: string;
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly name?: string;
  /** e.g. 'google.com', 'facebook.com' */
  readonly provider: string;
}

export interface ISocialIdentityVerifier {
  /** Throws UNAUTHENTICATED when the token is invalid or expired. */
  verify(idToken: string): Promise<VerifiedSocialIdentity>;
}
