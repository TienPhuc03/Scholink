import { AggregateRoot, DomainException, ErrorCode } from "@shared";

export type OpportunityType = "SCHOLARSHIP" | "COMPETITION";
export type OpportunityStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "PUBLISHED"
  | "CLOSED"
  | "CANCELLED";
export type ApplyMode = "IN_APP" | "EXTERNAL";
export type FundingLevel = "FULL" | "PARTIAL" | "OTHER" | "FREE_ENTRY";

export interface OpportunityProps {
  type: OpportunityType;
  title: string;
  slug: string;
  description: string;
  benefits?: string;
  requirements?: string;
  organizationId?: string;
  organizerName: string;
  sourceUrl?: string;
  applyMode: ApplyMode;
  status: OpportunityStatus;
  //múi giờ
  registerDeadline: Date;
  submitDeadline?: Date;
  timezone: string;

  //bộ lọc catalog
  fundingLevel?: FundingLevel;
  minGpa?: number;
  requiredIelts?: number;
  coverImageUrl?: string;
  isPromoted?: boolean;

  //cuộc thi
  competitionMode?: "INDIVIDUAL" | "TEAM";
  minTeamSize?: number;
  maxTeamSize?: number;
  eligibilityRules?: Record<string, any>[];
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class Opportunity extends AggregateRoot<string> {
  private _props: OpportunityProps;

  constructor(id: string, props: OpportunityProps) {
    super(
      id,
      props.version || 1,
      props.createdAt || new Date(),
      props.updatedAt || new Date(),
    );
    this._props = props;
    this.validate();
  }

  //factory-method tạo mới cơ hội
  public static create(
    id: string,
    props: Omit<
      OpportunityProps,
      "status" | "isPromoted" | "version" | "createdAt" | "updatedAt"
    > & {
      isPromoted?: boolean;
    },
  ): Opportunity {
    return new Opportunity(id, {
      ...props,
      status: "DRAFT",
      isPromoted: props.isPromoted ?? false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  //getters
  get type(): OpportunityType {
    return this._props.type;
  }

  get title(): string {
    return this._props.title;
  }

  get slug(): string {
    return this._props.slug;
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

  get timezone(): string {
    return this._props.timezone;
  }

  get isPromoted(): boolean {
    return this._props.isPromoted;
  }

  get props(): Readonly<OpportunityProps> {
    return this._props;
  }

  //check bất biến nghiêp vụ
  private validate(): void {
    if (!this._props.title || this._props.title.trim().length === 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Tiêu đề không được để trống",
        400,
      );
    }

    if (!this._props.timezone) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Timezone gốc không được để trống (BR10)",
        400,
      );
    }

    //in-app + external
    if (this._props.applyMode === "EXTERNAL") {
      if (!this._props.sourceUrl) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          "Hình thức EXTERNAL bắt buộc phải có đường dẫn nguồn (sourceUrl)",
          400,
        );
      }
    } else if (this._props.applyMode === "IN_APP") {
      if (!this._props.organizationId) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          "Hình thức IN_APP bắt buộc phải có organizationId để tiếp nhận hồ sơ",
          400,
        );
      }
    }

    //yêu cầu thi đấu đội
    if (
      this._props.type === "COMPETITION" &&
      this._props.competitionMode === "TEAM"
    ) {
      if (
        this._props.minTeamSize &&
        this._props.maxTeamSize &&
        this._props.minTeamSize > this._props.maxTeamSize
      ) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          "Số lượng thành viên tối thiểu không thể lớn hơn tối đa",
          400,
        );
      }
    }
  }

  public publish(): void {
    if (this._props.status !== "PENDING_REVIEW") {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        `Không thể công bố cơ hội đang ở trạng thái ${this._props.status}`,
        409,
      );
    }
    this._props.status = "PUBLISHED";
    this.incrementVersion();
    this.touch();
  }

  public close(): void {
    this._props.status = "CLOSED";
    this.incrementVersion();
  }

  public isRegistrationOpen(): boolean {
    return (
      this._props.status === "PUBLISHED" &&
      new Date() < this._props.registerDeadline
    );
  }

  private touch(): void {
    this._props.updatedAt = new Date();
  }
}
