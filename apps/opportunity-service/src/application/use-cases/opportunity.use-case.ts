import { Injectable, Inject } from "@nestjs/common";
import {
  IOpportunityRepository,
  OPPORTUNITY_REPOSITORY,
} from "../../domain/ports/opportunity.repository.port";
import { Opportunity } from "../../domain/opportunity.entity";
import {
  CreateOpportunityDto,
  QueryOpportunityDto,
  OpportunityDetailResponseDto,
} from "../dtos/opportunity.dto";
import { DomainException, PaginationHelper, PaginatedResult } from "@shared";

@Injectable()
export class OpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
  ) {}

  //hàm phụ trợ tạo slug tự động từ title nếu chưa có
  private generateSlug(title: string): string {
    return (
      title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") +
      "-" +
      Date.now().toString().slice(-4)
    );
  }

  async create(dto: CreateOpportunityDto, organizerId?: string) {
    const id = (globalThis as any).crypto.randomUUID();
    const opportunity = new Opportunity(id, {
      type: dto.type,
      title: dto.title,
      slug: dto.slug || this.generateSlug(dto.title),
      description: dto.description,
      benefits: dto.benefits,
      requirements: dto.requirements,
      organizationId: organizerId,
      organizerName: dto.organizerName,
      sourceUrl: dto.sourceUrl,
      applyMode: dto.applyMode,
      status: "PUBLISHED",
      registerDeadline: new Date(dto.registerDeadline),
      submitDeadline: dto.submitDeadline
        ? new Date(dto.submitDeadline)
        : undefined,
      timezone: dto.timezone,

      //bộ lọc + hiển thị catalog
      fundingLevel: dto.fundingLevel,
      minGpa: dto.minGpa ?? 0,
      requiredIelts: dto.requiredIelts ?? 0,
      coverImageUrl: dto.coverImageUrl,
      isPromoted: dto.isPromoted ?? false,

      //cuộc thi
      competitionMode: dto.competitionMode,
      minTeamSize: dto.minTeamSize,
      maxTeamSize: dto.maxTeamSize,
      eligibilityRules: dto.eligibilityRules,
      tags: dto.tags,
    });

    await this.opportunityRepo.save(opportunity);
    return opportunity.props;
  }

  async list(query: QueryOpportunityDto): Promise<PaginatedResult<any>> {
    const limit = query.limit || 10;
    const opportunities = await this.opportunityRepo.findMany({
      type: query.type,
      keyword: query.keyword,
      applyMode: query.applyMode,
      status: "PUBLISHED",
      limit: limit + 1,
      cursor: query.cursor,
    });

    return PaginationHelper.createPaginatedResponse(
      opportunities.map((o) => ({ ...o.props, id: o.id })),
      limit,
      (item) => ({ id: item.id, createdAt: item.createdAt }),
    );
  }

  async getById(id: string): Promise<OpportunityDetailResponseDto> {
    const opportunity = await this.opportunityRepo.findById(id);
    if (!opportunity) {
      throw DomainException.notFound("Cơ hội");
    }
    const props = opportunity.props;
    return {
      ...opportunity.props,
      id: opportunity.id,
      version: opportunity.version,
      registerDeadline: props.registerDeadline.toISOString(),
      submitDeadline: props.submitDeadline
        ? props.submitDeadline.toISOString()
        : undefined,
      createdAt: (props.createdAt || new Date()).toISOString(),
      updatedAt: (props.updatedAt || new Date()).toISOString(),
    } as OpportunityDetailResponseDto;
  }
}
