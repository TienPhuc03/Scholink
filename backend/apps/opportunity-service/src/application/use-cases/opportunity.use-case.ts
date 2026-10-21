import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { IOpportunityRepository, OPPORTUNITY_REPOSITORY } from '../../domain/ports/opportunity.repository.port';
import { Opportunity } from '../../domain/opportunity.entity';
import { CreateOpportunityDto, QueryOpportunityDto } from '../dtos/opportunity.dto';
import { DomainException, PaginationHelper, PaginatedResult } from '@shared';

@Injectable()
export class OpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
  ) {}

  async create(dto: CreateOpportunityDto, organizerId?: string) {
    const id = crypto.randomUUID();
    const opportunity = new Opportunity(id, {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      organizationId: organizerId,
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
      status: 'PUBLISHED',
      limit: limit + 1,
      cursor: query.cursor,
    });

    return PaginationHelper.createPaginatedResponse(
      opportunities.map((o) => ({ ...o.props, id: o.id })),
      limit,
      (item) => ({ id: item.id, createdAt: item.createdAt }),
    );
  }

  async getById(id: string) {
    const opportunity = await this.opportunityRepo.findById(id);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }
    return {
      ...opportunity.props,
      id: opportunity.id,
      version: opportunity.version,
    };
  }
}
