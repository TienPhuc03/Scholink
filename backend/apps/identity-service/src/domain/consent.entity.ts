import { Entity, DomainException, ErrorCode } from '@shared';

export interface ConsentProps {
  readonly actorId: string;
  readonly purpose: 'APPLICATION_SUBMISSION' | 'PROFILE_SHARING';
  readonly opportunityId: string;
  readonly submissionId?: string;
  readonly previewId: string;
  readonly snapshotId: string;
  readonly profileVersion: number;
  readonly ruleVersion: number;
  readonly manifestHash: string;
  readonly payloadHash: string;
  readonly scope?: readonly string[];
  readonly expiresAt: Date;
  readonly createdAt?: Date;
}

export class Consent extends Entity<string> {
  private readonly _props: Readonly<ConsentProps>;

  constructor(id: string, props: ConsentProps) {
    super(id, 1, props.createdAt || new Date(), props.createdAt || new Date());
    const normalizedScope =
      props.scope && props.scope.length > 0
        ? Object.freeze([...new Set(props.scope)])
        : Object.freeze(['SNAPSHOT', 'ATTACHMENTS']);
    this._props = Object.freeze({
      ...props,
      scope: normalizedScope,
    });
  }

  get actorId(): string {
    return this._props.actorId;
  }

  get opportunityId(): string {
    return this._props.opportunityId;
  }

  get previewId(): string {
    return this._props.previewId;
  }

  get snapshotId(): string {
    return this._props.snapshotId;
  }

  get payloadHash(): string {
    return this._props.payloadHash;
  }

  get manifestHash(): string {
    return this._props.manifestHash;
  }

  get profileVersion(): number {
    return this._props.profileVersion;
  }

  get ruleVersion(): number {
    return this._props.ruleVersion;
  }

  get scope(): readonly string[] {
    return this._props.scope ?? Object.freeze(['SNAPSHOT', 'ATTACHMENTS']);
  }

  get expiresAt(): Date {
    return this._props.expiresAt;
  }

  get props(): Readonly<ConsentProps> {
    return this._props;
  }

  get isExpired(): boolean {
    return new Date() > this._props.expiresAt;
  }

  /**
   * Mục 26 SRS: Kiểm tra hiệu lực Consent và phạm vi dữ liệu (scope) tại thời điểm Commit Application
   */
  public verifyForSubmission(params: {
    studentId: string;
    previewId: string;
    snapshotId: string;
    opportunityId: string;
    currentProfileVersion: number;
    expectedRuleVersion: number;
    expectedPayloadHash: string;
    requiredScope?: readonly string[];
  }): void {
    if (this.actorId !== params.studentId) {
      throw DomainException.forbidden('Consent không thuộc quyền sở hữu của sinh viên hiện tại');
    }

    if (this.isExpired) {
      throw DomainException.gone(
        ErrorCode.PREVIEW_EXPIRED,
        'Bản xem trước (Preview) và xác nhận (Consent) đã hết hạn 10 phút, vui lòng tạo lại',
      );
    }

    if (this.profileVersion !== params.currentProfileVersion) {
      throw DomainException.conflict(
        ErrorCode.SNAPSHOT_STALE,
        'Hồ sơ Passport đã thay đổi sau khi tạo Preview, vui lòng xem lại và xác nhận mới',
      );
    }

    const isMismatch =
      this.previewId !== params.previewId ||
      this.snapshotId !== params.snapshotId ||
      this.opportunityId !== params.opportunityId ||
      this.ruleVersion !== params.expectedRuleVersion ||
      this.payloadHash !== params.expectedPayloadHash;

    if (isMismatch) {
      throw DomainException.conflict(
        ErrorCode.CONSENT_MISMATCH,
        'Nội dung chữ ký Consent không khớp với bản chụp Preview hoặc phiên bản điều kiện',
      );
    }

    const requiredScope = params.requiredScope ?? ['SNAPSHOT'];
    const missingScopes = requiredScope.filter((item) => !this.scope.includes(item));
    if (missingScopes.length > 0) {
      throw DomainException.unprocessable(
        ErrorCode.CONSENT_REQUIRED,
        `Phạm vi đồng ý (scope) của Consent còn thiếu: ${missingScopes.join(', ')}`,
        missingScopes,
      );
    }
  }
}
