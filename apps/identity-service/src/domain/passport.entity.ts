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

  constructor(id: string, props: PassportProps) {
    super(
      id,
      props.profileVersion || 1,
      props.createdAt || new Date(),
      props.updatedAt || new Date(),
    );
    const normalizedSkills = Passport.normalizeSkills(props.skills);
    const computedScore = Passport.computeScore({
      ...props,
      skills: normalizedSkills,
    });

    this._props = Object.freeze({
      ...props,
      profileVersion: props.profileVersion || 1,
      skills: Object.freeze(normalizedSkills),
      achievements: props.achievements ? Object.freeze([...props.achievements]) : [],
      certificates: props.certificates ? Object.freeze([...props.certificates]) : [],
      education: props.education ? Object.freeze({ ...props.education }) : undefined,
      completionScore: computedScore,
      scoreVersion: 1,
    });
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
  public static computeScore(props: Partial<PassportProps>): number {
    let score = 0;

    // 1. Cơ bản (tối đa 20: tên + email xác minh = 10, avatar READY = 5, regionCode/bio = 5)
    if (props.fullName && props.fullName.trim().length >= 2) score += 10;
    if (props.avatarAssetId) score += 5;
    if (props.regionCode || props.bio) score += 5;

    // 2. Học vấn (tối đa 25: trường + ngành + năm học = 15, GPA hợp lệ trong thang = 10)
    const edu = props.education;
    if (edu?.institution && edu?.major) {
      score += 15;
      const scale = edu.gpaScale ?? 4;
      if (edu.gpa !== undefined && edu.gpa > 0 && edu.gpa <= scale) {
        score += 10;
      }
    }

    // 3. Chứng chỉ (10)
    if (props.certificates && props.certificates.length > 0) {
      score += 10;
    }

    // 4. Thành tích (15)
    if (props.achievements && props.achievements.length > 0) {
      score += 15;
    }

    // 5. Kỹ năng không trùng (5 điểm / kỹ năng, tối đa 15)
    const uniqueSkills = Passport.normalizeSkills(props.skills);
    score += Math.min(uniqueSkills.length * 5, 15);

    // 6. CV hoặc Pitch video (5)
    if (props.cvAssetId || props.pitchVideoAssetId) {
      score += 5;
    }

    // 7. Trạng thái tìm đội / học bổng / lịch (10)
    if (props.isLookingForTeammate || props.isOpenForScholarship || props.isOpenForMentoring) {
      score += 10;
    }

    return Math.min(score, 100);
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
