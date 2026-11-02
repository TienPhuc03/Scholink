export interface MemberProfileValidationResult {
  isValid: boolean;
  completionScore?: number;
  missingFields?: string[];
  message?: string;
}

export interface IIdentityClientPort {
  validateMemberProfile(studentId: string): Promise<MemberProfileValidationResult>;
}

export const IDENTITY_CLIENT = Symbol('IDENTITY_CLIENT');
