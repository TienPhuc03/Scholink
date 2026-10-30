import * as crypto from 'crypto';
import { DomainException, ErrorCode, OtpPurpose } from '@shared';

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 phút theo SRS FR-AUTH-02
export const OTP_COOLDOWN_MS = 60 * 1000; // 60 giây cooldown gửi lại
export const OTP_MAX_ATTEMPTS = 5; // Tối đa 5 lần nhập sai
export const OTP_LOCK_MS = 15 * 60 * 1000; // Khóa 15 phút khi nhập sai 5 lần

export interface OtpRecordProps {
  readonly normalizedEmail: string;
  readonly purpose: OtpPurpose;
  readonly otpHash: string;
  readonly attempts: number;
  readonly lockedUntil?: Date;
  readonly lastSentAt: Date;
  readonly expiresAt: Date;
}

/**
 * Thực thể bất biến quản lý vòng đời mã OTP (FR-AUTH-02, FR-AUTH-03).
 * Mọi thay đổi trạng thái (tăng số lần thử, khóa tạm thời, phát hành lại) đều trả về bản sao mới.
 */
export class OtpRecord {
  private readonly _props: Readonly<OtpRecordProps>;

  constructor(props: OtpRecordProps) {
    this._props = Object.freeze({
      ...props,
      normalizedEmail: props.normalizedEmail.trim().toLowerCase(),
      lockedUntil: props.lockedUntil ? new Date(props.lockedUntil) : undefined,
      lastSentAt: new Date(props.lastSentAt),
      expiresAt: new Date(props.expiresAt),
    });
    Object.freeze(this);
  }

  get normalizedEmail(): string {
    return this._props.normalizedEmail;
  }

  get purpose(): OtpPurpose {
    return this._props.purpose;
  }

  get otpHash(): string {
    return this._props.otpHash;
  }

  get attempts(): number {
    return this._props.attempts;
  }

  get lockedUntil(): Date | undefined {
    return this._props.lockedUntil;
  }

  get lastSentAt(): Date {
    return this._props.lastSentAt;
  }

  get expiresAt(): Date {
    return this._props.expiresAt;
  }

  get props(): Readonly<OtpRecordProps> {
    return this._props;
  }

  /**
   * Khởi tạo bản ghi OTP mới với thời hạn 5 phút.
   */
  public static issueNew(params: {
    email: string;
    purpose: OtpPurpose;
    otpHash: string;
    now?: Date;
  }): OtpRecord {
    const now = params.now ?? new Date();
    return new OtpRecord({
      normalizedEmail: params.email.trim().toLowerCase(),
      purpose: params.purpose,
      otpHash: params.otpHash,
      attempts: 0,
      lockedUntil: undefined,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    });
  }

  /**
   * Kiểm tra xem người dùng có được phép yêu cầu gửi lại OTP hay không (chặn nếu đang khóa 15p hoặc chưa hết cooldown 60s).
   */
  public assertCanResend(now: Date = new Date()): void {
    if (this._props.lockedUntil && now < this._props.lockedUntil) {
      throw new DomainException(
        ErrorCode.OTP_LOCKED,
        'Tài khoản đang tạm khóa gửi/xác thực OTP trong 15 phút do nhập sai quá 5 lần',
        429,
      );
    }

    const elapsedMs = now.getTime() - this._props.lastSentAt.getTime();
    if (elapsedMs < OTP_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((OTP_COOLDOWN_MS - elapsedMs) / 1000);
      throw new DomainException(
        ErrorCode.RATE_LIMITED,
        `Vui lòng đợi ${remainingSeconds} giây trước khi yêu cầu gửi lại mã OTP`,
        429,
      );
    }
  }

  /**
   * Kiểm tra mã băm OTP theo thời gian hằng số (timing-safe).
   * Trả về kết quả khớp kèm bản ghi OtpRecord bất biến mới nếu cần tăng bộ đếm lỗi/khóa 15 phút.
   */
  public verifyAttempt(
    candidateHash: string,
    now: Date = new Date(),
  ): { readonly matched: boolean; readonly updatedRecord: OtpRecord } {
    if (this._props.lockedUntil && now < this._props.lockedUntil) {
      throw new DomainException(
        ErrorCode.OTP_LOCKED,
        'Mã OTP đã bị khóa 15 phút do nhập sai quá 5 lần',
        429,
      );
    }

    if (now > this._props.expiresAt) {
      throw new DomainException(
        ErrorCode.OTP_EXPIRED,
        'Mã OTP đã hết hạn (quá 5 phút), vui lòng yêu cầu mã mới',
        400,
      );
    }

    const expectedBuf = Buffer.from(this._props.otpHash, 'utf8');
    const actualBuf = Buffer.from(candidateHash, 'utf8');
    const matched =
      expectedBuf.length === actualBuf.length &&
      crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (matched) {
      return Object.freeze({ matched: true, updatedRecord: this });
    }

    const nextAttempts = this._props.attempts + 1;
    const isNowLocked = nextAttempts >= OTP_MAX_ATTEMPTS;
    const updatedRecord = new OtpRecord({
      ...this._props,
      attempts: nextAttempts,
      lockedUntil: isNowLocked ? new Date(now.getTime() + OTP_LOCK_MS) : this._props.lockedUntil,
    });

    return Object.freeze({ matched: false, updatedRecord });
  }
}
