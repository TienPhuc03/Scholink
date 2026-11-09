export interface MemberProfileValidationResult {
  isValid: boolean;
  completionScore?: number;
  missingFields?: string[];
  message?: string;
}

export interface IIdentityClientPort {
  validateMemberProfile(studentId: string): Promise<MemberProfileValidationResult>;
  /** FR-PROF-05: a member's Passport filtered for the given audience (Identity applies the rules). */
  getProfileView?(studentId: string, audience: 'PUBLIC' | 'TEAMMATES'): Promise<Record<string, unknown>>;
}

export const IDENTITY_CLIENT = Symbol('IDENTITY_CLIENT');
