import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IOpportunityRepository,
  OPPORTUNITY_REPOSITORY,
} from '../../domain/ports/opportunity.repository.port';
import { Opportunity } from '../../domain/opportunity.entity';
import {
  CreateOpportunityDto,
  QueryOpportunityDto,
  OpportunityDetailResponseDto,
} from '../dtos/opportunity.dto';
import { DomainException, PaginationHelper, PaginatedResult } from '@shared';

@Injectable()
export class OpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
  ) {}

  private generateSlug(title: string): string {
    return (
      title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') +
      '-' +
      Date.now().toString().slice(-4)
    );
  }

  async create(dto: CreateOpportunityDto, actorId: string, organizationId?: string) {
    const id = `opp_${crypto.randomUUID()}`;
    const opportunity = new Opportunity(id, {
      type: dto.type,
      title: dto.title,
      slug: dto.slug || this.generateSlug(dto.title),
      description: dto.description,
      benefits: dto.benefits,
      requirements: dto.requirements,
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
      minGpa: dto.minGpa ?? 0,
      requiredIelts: dto.requiredIelts ?? 0,
      coverImageUrl: dto.coverImageUrl,
      isPromoted: dto.isPromoted ?? false,
      competitionMode: dto.competitionMode,
      minTeamSize: dto.minTeamSize,
      maxTeamSize: dto.maxTeamSize,
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
      opportunities.map((o) => this.toResponse(o) as any),
      limit,
      (item) => ({ id: item.id as string, createdAt: item.createdAt as string }),
    );
  }

  async getById(id: string): Promise<OpportunityDetailResponseDto> {
    const opportunity = await this.opportunityRepo.findById(id);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }
    return this.toResponse(opportunity);
  }

  private toResponse(opportunity: Opportunity): OpportunityDetailResponseDto {
    const props = opportunity.props;
    return Object.freeze({
      ...props,
      id: opportunity.id,
      registerDeadline: opportunity.registerDeadline.toISOString(),
      submitDeadline: props.submitDeadline
        ? props.submitDeadline.toISOString()
        : undefined,
      createdAt: (opportunity.createdAt || new Date()).toISOString(),
      updatedAt: (opportunity.updatedAt || new Date()).toISOString(),
      ruleVersion: opportunity.ruleVersion,
      version: opportunity.version,
    }) as OpportunityDetailResponseDto;
  }
}
