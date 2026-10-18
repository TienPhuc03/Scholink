import { AggregateRoot } from '@shared';

export interface Education {
  institution: string;
  major: string;
  startYear: number;
  endYear?: number;
  gpa?: number;
  gpaScale?: number;
}

export interface Certificate {
  type: string;
  name: string;
  score?: string;
  issuedDate: Date;
  expiryDate?: Date;
  assetId?: string;
  status: 'SELF_DECLARED' | 'VERIFIED' | 'REJECTED';
}

export interface PassportProps {
  studentId: string;
  profileVersion: number;
  fullName: string;
  avatarAssetId?: string;
  bio?: string;
  education?: Education;
  certificates?: Certificate[];
  skills?: string[];
  achievements?: string[];
  cvAssetId?: string;
  pitchVideoAssetId?: string;
  isLookingForTeammate: boolean;
  isOpenForScholarship: boolean;
  isOpenForMentoring: boolean;
  completionScore: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Passport extends AggregateRoot<string> {
  private _props: PassportProps;

  constructor(id: string, props: PassportProps) {
    super(id, props.profileVersion || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
    this._props.completionScore = this.calculateCompletionScore();
  }

  get studentId(): string {
    return this._props.studentId;
  }

  get profileVersion(): number {
    return this.version;
  }

  get completionScore(): number {
    return this._props.completionScore;
  }

  get props(): Readonly<PassportProps> {
    return this._props;
  }

  public calculateCompletionScore(): number {
    let score = 0;
    if (this._props.fullName && this._props.avatarAssetId) score += 20;
    else if (this._props.fullName) score += 10;

    if (this._props.education?.institution && this._props.education?.major) score += 25;
    if (this._props.certificates && this._props.certificates.length > 0) score += 10;
    if (this._props.achievements && this._props.achievements.length > 0) score += 15;
    if (this._props.skills && this._props.skills.length > 0) score += 15;
    if (this._props.cvAssetId || this._props.pitchVideoAssetId) score += 5;
    if (this._props.isLookingForTeammate || this._props.isOpenForScholarship) score += 10;

    return Math.min(score, 100);
  }

  public updateProfile(data: Partial<PassportProps>): void {
    Object.assign(this._props, data);
    this._props.completionScore = this.calculateCompletionScore();
    this.incrementVersion();
  }
}
