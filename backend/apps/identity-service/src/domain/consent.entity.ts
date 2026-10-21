import { Entity } from '@shared';

export interface ConsentProps {
  actorId: string;
  purpose: 'APPLICATION_SUBMISSION' | 'PROFILE_SHARING';
  opportunityId: string;
  submissionId?: string;
  previewId: string;
  snapshotId: string;
  profileVersion: number;
  ruleVersion: number;
  manifestHash: string;
  payloadHash: string;
  expiresAt: Date;
  createdAt?: Date;
}

export class Consent extends Entity<string> {
  private _props: ConsentProps;

  constructor(id: string, props: ConsentProps) {
    super(id, 1, props.createdAt || new Date(), props.createdAt || new Date());
    this._props = props;
  }

  get actorId(): string {
    return this._props.actorId;
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

  get profileVersion(): number {
    return this._props.profileVersion;
  }

  get isExpired(): boolean {
    return new Date() > this._props.expiresAt;
  }
}
