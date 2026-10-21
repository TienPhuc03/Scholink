export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  FORBIDDEN_ROLE = 'FORBIDDEN_ROLE',
  FORBIDDEN_RESOURCE = 'FORBIDDEN_RESOURCE',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_APPLIED = 'ALREADY_APPLIED',
  SLOT_FULL = 'SLOT_FULL',
  VERSION_MISMATCH = 'VERSION_MISMATCH',
  DEADLINE_PASSED = 'DEADLINE_PASSED',
  HOLD_EXPIRED = 'HOLD_EXPIRED',
  CONSENT_STALE = 'CONSENT_STALE',
  CONSENT_MISMATCH = 'CONSENT_MISMATCH',
  PREVIEW_EXPIRED = 'PREVIEW_EXPIRED',
  SNAPSHOT_STALE = 'SNAPSHOT_STALE',
  STATE_CONFLICT = 'STATE_CONFLICT',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  REQUEST_IN_PROGRESS = 'REQUEST_IN_PROGRESS',
  PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  RATE_LIMITED = 'RATE_LIMITED',
  UPSTREAM_UNAVAILABLE = 'UPSTREAM_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class DomainException extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: any[];

  constructor(code: ErrorCode, message: string, statusCode: number = 400, details?: any[]) {
    super(message);
    this.name = 'DomainException';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, DomainException.prototype);
  }

  static notFound(resource: string = 'Resource'): DomainException {
    return new DomainException(ErrorCode.NOT_FOUND, `${resource} không tồn tại`, 404);
  }

  static forbidden(message: string = 'Không có quyền truy cập tài nguyên này'): DomainException {
    return new DomainException(ErrorCode.FORBIDDEN_RESOURCE, message, 403);
  }

  static forbiddenRole(message: string = 'Vai trò người dùng không hợp lệ'): DomainException {
    return new DomainException(ErrorCode.FORBIDDEN_ROLE, message, 403);
  }

  static conflict(code: ErrorCode, message: string): DomainException {
    return new DomainException(code, message, 409);
  }

  static unprocessable(code: ErrorCode, message: string, details?: any[]): DomainException {
    return new DomainException(code, message, 422, details);
  }
}
