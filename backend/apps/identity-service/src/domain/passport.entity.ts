import { AggregateRoot } from '@shared';

export interface Education {
  readonly institution?: string;
  readonly major?: string;
  readonly startYear?: number;
  readonly endYear?: number;
  readonly studyYear?: number;
  readonly gpa?: number;
  readonly gpaScale?: number;
}

export interface Certificate {
  readonly type: string;
  readonly name: string;
  readonly score?: string;
  readonly issuedDate: Date;
  readonly expiryDate?: Date;
  readonly assetId?: string;
  readonly status: 'SELF_DECLARED' | 'VERIFIED' | 'REJECTED';
}

export interface ScoreBreakdown {
  readonly basicScore: number;
  readonly educationScore: number;
  readonly certificateScore: number;
  readonly achievementScore: number;
  readonly skillScore: number;
  readonly cvOrVideoScore: number;
  readonly intentScore: number;
  readonly totalScore: number;
}

export interface PassportProps {
  readonly studentId: string;
  readonly profileVersion: number;
  readonly fullName: string;
  readonly avatarAssetId?: string;
  readonly regionCode?: string;
  readonly bio?: string;
  readonly education?: Education;
  readonly certificates?: readonly Certificate[];
  readonly skills?: readonly string[];
  readonly achievements?: readonly string[];
  readonly cvAssetId?: string;
  readonly pitchVideoAssetId?: string;
  readonly isLookingForTeammate: boolean;
  readonly isOpenForScholarship: boolean;
  readonly isOpenForMentoring: boolean;
  readonly completionScore?: number;
  readonly scoreVersion?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class Passport extends AggregateRoot<string> {
  private readonly _props: Readonly<PassportProps>;
  private readonly _scoreBreakdown: Readonly<ScoreBreakdown>;

  constructor(id: string, props: PassportProps) {
    super(
      id,
      props.profileVersion || 1,
      props.createdAt || new Date(),
      props.updatedAt || new Date(),
    );
    const normalizedSkills = Passport.normalizeSkills(props.skills);
    const breakdown = Passport.computeScoreBreakdown({
      ...props,
      skills: normalizedSkills,
    });

    this._scoreBreakdown = breakdown;
    this._props = Object.freeze({
      ...props,
      profileVersion: props.profileVersion || 1,
      skills: Object.freeze(normalizedSkills),
      achievements: props.achievements ? Object.freeze([...props.achievements]) : [],
      certificates: props.certificates ? Object.freeze([...props.certificates]) : [],
      education: props.education ? Object.freeze({ ...props.education }) : undefined,
      completionScore: breakdown.totalScore,
      scoreVersion: 1,
    });
    Object.freeze(this);
  }

  get studentId(): string {
    return this._props.studentId;
  }

  get profileVersion(): number {
    return this.version;
  }

  get completionScore(): number {
    return this._props.completionScore ?? 0;
  }

  get scoreBreakdown(): Readonly<ScoreBreakdown> {
    return this._scoreBreakdown;
  }

  get scoreVersion(): number {
    return this._props.scoreVersion ?? 1;
  }

  get props(): Readonly<PassportProps> {
    return this._props;
  }

  public static normalizeSkills(skills?: readonly string[]): string[] {
    if (!skills || skills.length === 0) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of skills) {
      const trimmed = raw.trim();
      const key = trimmed.toLowerCase();
      if (trimmed && !seen.has(key)) {
        seen.add(key);
        result.push(trimmed);
      }
    }
    return result;
  }

  /**
   * Mục 12A SRS (scoreVersion = 1):
   * Cơ bản (20) + Học vấn (25) + Chứng chỉ (10) + Thành tích (15) + Kỹ năng (15) + CV/Video (5) + Lịch/Vị trí (10) = 100
   */
  public static computeScoreBreakdown(props: Partial<PassportProps>): Readonly<ScoreBreakdown> {
    let basicScore = 0;
    if (props.fullName && props.fullName.trim().length >= 2) basicScore += 10;
    if (props.avatarAssetId) basicScore += 5;
    if (props.regionCode || props.bio) basicScore += 5;

    let educationScore = 0;
    const edu = props.education;
    if (edu?.institution && edu?.major) {
      educationScore += 15;
      const scale = edu.gpaScale ?? 4;
      if (edu.gpa !== undefined && edu.gpa > 0 && edu.gpa <= scale) {
        educationScore += 10;
      }
    }

    const certificateScore = props.certificates && props.certificates.length > 0 ? 10 : 0;
    const achievementScore = props.achievements && props.achievements.length > 0 ? 15 : 0;

    const uniqueSkills = Passport.normalizeSkills(props.skills);
    const skillScore = Math.min(uniqueSkills.length * 5, 15);

    const cvOrVideoScore = props.cvAssetId || props.pitchVideoAssetId ? 5 : 0;
    const intentScore =
      props.isLookingForTeammate || props.isOpenForScholarship || props.isOpenForMentoring
        ? 10
        : 0;

    const totalScore = Math.min(
      basicScore +
        educationScore +
        certificateScore +
        achievementScore +
        skillScore +
        cvOrVideoScore +
        intentScore,
      100,
    );

    return Object.freeze({
      basicScore,
      educationScore,
      certificateScore,
      achievementScore,
      skillScore,
      cvOrVideoScore,
      intentScore,
      totalScore,
    });
  }

  public static computeScore(props: Partial<PassportProps>): number {
    return Passport.computeScoreBreakdown(props).totalScore;
  }

  /**
   * Trích xuất toàn bộ danh sách assetId đang được tham chiếu trong Passport
   * để kiểm tra quyền sở hữu (ownerId === studentId) và trạng thái READY (BR15).
   */
  public getReferencedAssetIds(): string[] {
    const ids = new Set<string>();
    if (this._props.avatarAssetId?.trim()) {
      ids.add(this._props.avatarAssetId.trim());
    }
    if (this._props.cvAssetId?.trim()) {
      ids.add(this._props.cvAssetId.trim());
    }
    if (this._props.pitchVideoAssetId?.trim()) {
      ids.add(this._props.pitchVideoAssetId.trim());
    }
    for (const cert of this._props.certificates ?? []) {
      if (cert.assetId?.trim()) {
        ids.add(cert.assetId.trim());
      }
    }
    return [...ids];
  }

  public getMissingFields(): string[] {
    const missing: string[] = [];
    if (!this._props.fullName || this._props.fullName.trim().length < 2) {
      missing.push('fullName');
    }
    if (!this._props.education?.institution) {
      missing.push('education.institution');
    }
    if (!this._props.education?.major) {
      missing.push('education.major');
    }
    if (this._props.education?.gpa === undefined) {
      missing.push('education.gpa');
    }
    return missing;
  }

  /**
   * Immutable update: Trả về bản sao Passport mới với profileVersion tăng thêm 1
   */
  public updateProfile(changes: Partial<PassportProps>): Passport {
    const nextVersion = this.version + 1;
    return new Passport(this.id, {
      ...this._props,
      ...changes,
      studentId: this.studentId,
      profileVersion: nextVersion,
      updatedAt: new Date(),
    });
  }
}
