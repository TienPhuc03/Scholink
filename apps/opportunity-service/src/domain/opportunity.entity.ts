import { AggregateRoot, DomainException, ErrorCode } from '@shared';

export type OpportunityType = 'SCHOLARSHIP' | 'COMPETITION';
export type OpportunityStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'CLOSED'
  | 'CANCELLED';
export type ApplyMode = 'IN_APP' | 'EXTERNAL';

export type EligibilityRuleOperator = 'EQ' | 'IN' | 'GTE' | 'LTE' | 'EXISTS';
export type EligibilityRuleType = 'HARD' | 'SOFT';

export interface EligibilityRule {
  readonly fieldKey: string;
  readonly operator: EligibilityRuleOperator;
  readonly value?: unknown;
  readonly scale?: number;
  readonly type?: EligibilityRuleType;
}

export interface ScreeningReason {
  readonly ruleFieldKey: string;
  readonly reasonCode: string;
  readonly message: string;
}

export interface ScreeningEvaluationResult {
  readonly readinessScore: number;
  readonly isReady: boolean;
  readonly missingFields: readonly string[];
  readonly screening: 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';
  readonly screeningReasons: readonly ScreeningReason[];
}

export interface OpportunityProps {
  readonly type: OpportunityType;
  readonly title: string;
  readonly description: string;
  readonly organizationId?: string;
  readonly createdBy?: string;
  readonly organizerName: string;
  readonly sourceUrl?: string;
  readonly applyMode: ApplyMode;
  readonly status: OpportunityStatus;
  readonly registerDeadline: Date;
  readonly submitDeadline?: Date;
  readonly timezone: string;
  readonly fundingLevel?: 'FULL' | 'PARTIAL' | 'OTHER';
  readonly competitionMode?: 'INDIVIDUAL' | 'TEAM';
  readonly minTeamSize?: number;
  readonly maxTeamSize?: number;
  readonly eligibilityRules?: readonly (EligibilityRule | Record<string, unknown>)[];
  readonly requiredFields?: readonly string[];
  readonly tags?: readonly string[];
  readonly ruleVersion?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly version?: number;
}

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
};

const isValuePresent = (val: unknown): boolean => {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
};

const evaluateOperator = (
  actual: unknown,
  operator: EligibilityRuleOperator,
  expected: unknown,
): boolean => {
  if (operator === 'EXISTS') {
    return expected === false ? !isValuePresent(actual) : isValuePresent(actual);
  }
  if (!isValuePresent(actual)) {
    return false;
  }
  switch (operator) {
    case 'EQ':
      if (Array.isArray(actual)) {
        return actual.some(
          (item) => String(item).toLowerCase() === String(expected).toLowerCase(),
        );
      }
      return String(actual).toLowerCase() === String(expected).toLowerCase();
    case 'IN': {
      const list = Array.isArray(expected) ? expected : [expected];
      if (Array.isArray(actual)) {
        return actual.some((item) =>
          list.some((exp) => String(exp).toLowerCase() === String(item).toLowerCase()),
        );
      }
      return list.some((exp) => String(exp).toLowerCase() === String(actual).toLowerCase());
    }
    case 'GTE':
      return Number(actual) >= Number(expected);
    case 'LTE':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
};

export class Opportunity extends AggregateRoot<string> {
  private readonly _props: Readonly<OpportunityProps>;

  constructor(id: string, props: OpportunityProps) {
    super(
      id,
      props.version || 1,
      props.createdAt || new Date(),
      props.updatedAt || new Date(),
    );
    this._props = Object.freeze({
      ...props,
      ruleVersion: props.ruleVersion ?? 1,
      tags: props.tags ? Object.freeze([...props.tags]) : [],
      eligibilityRules: props.eligibilityRules
        ? Object.freeze([...props.eligibilityRules])
        : [],
      requiredFields: props.requiredFields ? Object.freeze([...props.requiredFields]) : [],
    });
  }

  get type(): OpportunityType {
    return this._props.type;
  }

  get title(): string {
    return this._props.title;
  }

  get status(): OpportunityStatus {
    return this._props.status;
  }

  get applyMode(): ApplyMode {
    return this._props.applyMode;
  }

  get registerDeadline(): Date {
    return this._props.registerDeadline;
  }

  get ruleVersion(): number {
    return this._props.ruleVersion ?? 1;
  }

  get props(): Readonly<OpportunityProps> {
    return this._props;
  }

  public publish(): Opportunity {
    if (this._props.status !== 'PENDING_REVIEW' && this._props.status !== 'DRAFT') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        `Không thể công bố cơ hội đang ở trạng thái ${this._props.status}`,
      );
    }
    return new Opportunity(this.id, {
      ...this._props,
      status: 'PUBLISHED',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public close(): Opportunity {
    return new Opportunity(this.id, {
      ...this._props,
      status: 'CLOSED',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public isRegistrationOpen(now: Date = new Date()): boolean {
    return this._props.status === 'PUBLISHED' && now < this._props.registerDeadline;
  }

  /**
   * Mục 10, FR-PROF-03/08, FR-APP-02, BR05 & BR07 SRS:
   * Đánh giá độ sẵn sàng (Readiness) và sàng lọc điều kiện (Screening) trên Snapshot bất biến.
   * - Thiếu trường bắt buộc -> trả về trong `missingFields` (dùng để chặn 422 PROFILE_INCOMPLETE).
   * - Chứng chỉ có `expiryDate < registerDeadline` không được tính đạt.
   * - Lệch hệ thang điểm GPA (`gpaScale !== rule.scale`) -> `NEEDS_REVIEW` (BR07).
   * - Minh chứng ở trạng thái `SELF_DECLARED` hoặc trượt rule `SOFT` -> `NEEDS_REVIEW`.
   * - Trượt rule `HARD` -> `INELIGIBLE`.
   */
  public evaluateScreening(
    snapshot: Record<string, unknown>,
    baseMissingFields: readonly string[] = [],
  ): ScreeningEvaluationResult {
    const requiredFields = this._props.requiredFields ?? [];
    const rawCerts = Array.isArray(snapshot.certificates)
      ? (snapshot.certificates as Record<string, unknown>[])
      : [];

    // Lọc bỏ các chứng chỉ đã hết hạn trước registerDeadline (Mục 10 SRS)
    const validCertificates = rawCerts.filter((cert) => {
      if (!cert.expiryDate) return true;
      const exp = new Date(String(cert.expiryDate));
      return !Number.isNaN(exp.getTime()) && exp.getTime() >= this._props.registerDeadline.getTime();
    });

    const normalizedSnapshot: Record<string, unknown> = {
      ...snapshot,
      certificates: validCertificates,
    };

    const missingSet = new Set<string>(baseMissingFields);
    let validRequiredCount = 0;

    for (const fieldKey of requiredFields) {
      const val = getNestedValue(normalizedSnapshot, fieldKey);
      if (isValuePresent(val)) {
        validRequiredCount += 1;
      } else {
        missingSet.add(fieldKey);
      }
    }

    const readinessScore =
      requiredFields.length > 0
        ? Math.round((validRequiredCount / requiredFields.length) * 100)
        : missingSet.size === 0
          ? 100
          : Number(snapshot.completionScore ?? 0);

    const reasons: ScreeningReason[] = [];
    let isIneligible = false;
    let needsReview = false;

    const rules = (this._props.eligibilityRules ?? []) as EligibilityRule[];
    const education = (snapshot.education ?? {}) as Record<string, unknown>;

    for (const rule of rules) {
      if (!rule || !rule.fieldKey || !rule.operator) continue;
      const ruleType: EligibilityRuleType = rule.type === 'SOFT' ? 'SOFT' : 'HARD';

      // BR07: Kiểm tra lệch hệ thang điểm GPA
      if (rule.fieldKey === 'education.gpa' && rule.scale !== undefined) {
        const studentScale = Number(education.gpaScale ?? 4);
        if (studentScale !== Number(rule.scale)) {
          needsReview = true;
          reasons.push(
            Object.freeze({
              ruleFieldKey: rule.fieldKey,
              reasonCode: 'GPA_SCALE_MISMATCH',
              message: `Hệ thang điểm GPA của hồ sơ (${studentScale}) khác với hệ thang điểm yêu cầu (${rule.scale}), cần xét duyệt thủ công (BR07)`,
            }),
          );
          continue;
        }
      }

      // Kiểm tra đặc thù trên danh sách chứng chỉ còn hạn
      if (rule.fieldKey.startsWith('certificates')) {
        const subKey = rule.fieldKey.replace(/^certificates\.?/, '');
        const matchingCerts = subKey
          ? validCertificates.filter((c) => evaluateOperator(c[subKey], rule.operator, rule.value))
          : evaluateOperator(validCertificates, rule.operator, rule.value)
            ? validCertificates
            : [];

        if (matchingCerts.length === 0) {
          if (ruleType === 'HARD') {
            isIneligible = true;
            reasons.push(
              Object.freeze({
                ruleFieldKey: rule.fieldKey,
                reasonCode: 'HARD_RULE_FAILED',
                message: `Không đạt điều kiện chứng chỉ bắt buộc (${rule.fieldKey} ${rule.operator} ${String(rule.value ?? '')}) hoặc chứng chỉ đã hết hạn trước hạn đăng ký`,
              }),
            );
          } else {
            needsReview = true;
            reasons.push(
              Object.freeze({
                ruleFieldKey: rule.fieldKey,
                reasonCode: 'SOFT_RULE_UNMET',
                message: `Chưa đạt tiêu chí ưu tiên (${rule.fieldKey})`,
              }),
            );
          }
        } else if (matchingCerts.every((c) => c.status !== 'VERIFIED')) {
          needsReview = true;
          reasons.push(
            Object.freeze({
              ruleFieldKey: rule.fieldKey,
              reasonCode: 'EVIDENCE_SELF_DECLARED',
              message: 'Chứng chỉ đạt ngưỡng nhưng đang ở trạng thái tự khai báo (SELF_DECLARED), cần xác minh minh chứng',
            }),
          );
        }
        continue;
      }

      const actualValue = getNestedValue(normalizedSnapshot, rule.fieldKey);
      const passed = evaluateOperator(actualValue, rule.operator, rule.value);

      if (!passed) {
        if (ruleType === 'HARD') {
          isIneligible = true;
          reasons.push(
            Object.freeze({
              ruleFieldKey: rule.fieldKey,
              reasonCode: 'HARD_RULE_FAILED',
              message: `Không thỏa điều kiện bắt buộc: ${rule.fieldKey} ${rule.operator} ${String(rule.value ?? '')}`,
            }),
          );
        } else {
          needsReview = true;
          reasons.push(
            Object.freeze({
              ruleFieldKey: rule.fieldKey,
              reasonCode: 'SOFT_RULE_UNMET',
              message: `Chưa đạt tiêu chí ưu tiên: ${rule.fieldKey} ${rule.operator} ${String(rule.value ?? '')}`,
            }),
          );
        }
      }
    }

    // Nếu cơ hội yêu cầu trường certificates mà toàn bộ chứng chỉ hợp lệ đều là SELF_DECLARED
    if (
      !isIneligible &&
      requiredFields.includes('certificates') &&
      validCertificates.length > 0 &&
      validCertificates.every((c) => c.status !== 'VERIFIED') &&
      !reasons.some((r) => r.reasonCode === 'EVIDENCE_SELF_DECLARED')
    ) {
      needsReview = true;
      reasons.push(
        Object.freeze({
          ruleFieldKey: 'certificates',
          reasonCode: 'EVIDENCE_SELF_DECLARED',
          message: 'Chứng chỉ trong hồ sơ đang ở trạng thái tự khai báo (SELF_DECLARED), cần xác minh minh chứng',
        }),
      );
    }

    const screening = isIneligible
      ? 'INELIGIBLE'
      : needsReview
        ? 'NEEDS_REVIEW'
        : 'ELIGIBLE';

    return Object.freeze({
      readinessScore,
      isReady: missingSet.size === 0,
      missingFields: Object.freeze(Array.from(missingSet)),
      screening,
      screeningReasons: Object.freeze(reasons),
    });
  }
}
