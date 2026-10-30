import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IOpportunityRepository,
  OPPORTUNITY_REPOSITORY,
} from '../../domain/ports/opportunity.repository.port';
import { Opportunity } from '../../domain/opportunity.entity';
import { CreateOpportunityDto, QueryOpportunityDto } from '../dtos/opportunity.dto';
import { DomainException, PaginationHelper, PaginatedResult } from '@shared';

@Injectable()
export class OpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
  ) {}

  async create(dto: CreateOpportunityDto, actorId: string, organizationId?: string) {
    const id = `opp_${crypto.randomUUID()}`;
    // Mục 2 SRS: Cơ hội thuộc organizationId lấy từ server, createdBy chỉ phục vụ audit
    const opportunity = new Opportunity(id, {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      organizationId: organizationId || actorId,
      createdBy: actorId,
      organizerName: dto.organizerName,
      sourceUrl: dto.sourceUrl,
      applyMode: dto.applyMode,
      status: 'PUBLISHED',
      registerDeadline: new Date(dto.registerDeadline),
      submitDeadline: dto.submitDeadline ? new Date(dto.submitDeadline) : undefined,
      timezone: dto.timezone,
      fundingLevel: dto.fundingLevel,
      competitionMode: dto.competitionMode,
      minTeamSize: dto.minTeamSize,
      maxTeamSize: dto.maxTeamSize,
      requiredFields: dto.requiredFields,
      eligibilityRules: dto.eligibilityRules,
      tags: dto.tags,
      ruleVersion: 1,
    });

    await this.opportunityRepo.save(opportunity);
    return this.toResponse(opportunity);
  }

  async list(query: QueryOpportunityDto): Promise<PaginatedResult<Record<string, unknown>>> {
    const limit = query.limit || 10;
    const opportunities = await this.opportunityRepo.findMany({
      type: query.type,
      keyword: query.keyword,
      applyMode: query.applyMode,
      status: 'PUBLISHED',
      limit: limit + 1,
      cursor: query.cursor,
    });

    return PaginationHelper.createPaginatedResponse(
      opportunities.map((o) => this.toResponse(o)),
      limit,
      (item) => ({ id: item.id, createdAt: item.createdAt }),
    );
  }

  async getById(id: string) {
    const opportunity = await this.opportunityRepo.findById(id);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }
    return this.toResponse(opportunity);
  }

  private toResponse(opportunity: Opportunity) {
    return Object.freeze({
      ...opportunity.props,
      id: opportunity.id,
      registerDeadline: opportunity.registerDeadline.toISOString(),
      submitDeadline: opportunity.props.submitDeadline
        ? opportunity.props.submitDeadline.toISOString()
        : undefined,
      ruleVersion: opportunity.ruleVersion,
      version: opportunity.version,
    });
  }
}
