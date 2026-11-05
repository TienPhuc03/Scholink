import { Injectable, Inject, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  IOpportunityRepository,
  OPPORTUNITY_REPOSITORY,
  OpportunityFilter,
} from '../../domain/ports/opportunity.repository.port';
import { Opportunity } from '../../domain/opportunity.entity';
import {
  CreateOpportunityDto,
  QueryOpportunityDto,
  OpportunityDetailResponseDto,
} from '../dtos/opportunity.dto';
import { DomainException, ErrorCode, PaginationHelper, PaginatedResult, AuthenticatedUser } from '@shared';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ExternalRegistrationModel,
  ExternalRegistrationDocument,
} from '../../infrastructure/persistence/opportunity.schema';

@Injectable()
export class OpportunityUseCase {
  private memoryExternalRegs = new Map<string, any>();

  constructor(
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
    @Optional()
    @InjectModel(ExternalRegistrationModel.name)
    private readonly externalRegModel?: Model<ExternalRegistrationDocument>,
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
      organizationId: organizationId || dto.organizationId || actorId,
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
      opportunities.map((o) => this.toResponse(o) as any),
      limit,
      (item) => ({ id: item.id as string, createdAt: item.createdAt as string }),
    );
  }

  async listMyOpportunities(caller: AuthenticatedUser): Promise<OpportunityDetailResponseDto[]> {
    if (caller.role !== 'ADMIN' && !caller.organizationId) {
      throw DomainException.forbidden('Tài khoản chưa được gán vào đơn vị tổ chức');
    }

    const filter: OpportunityFilter =
      caller.role === 'ADMIN'
        ? { limit: 100 }
        : { organizationId: caller.organizationId, limit: 100 };

    const opportunities = await this.opportunityRepo.findMany(filter);
    return opportunities.map((o) => this.toResponse(o));
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

  /**
   * WF05 & FR-APP-04: Tự đánh dấu đã nộp tại nguồn (EXTERNAL_MARKED)
   * Nghiệm thu: Lưu vào external_registrations, KHÔNG tạo Application record.
   * Chặn không cho tự đánh dấu nếu cơ hội là IN_APP.
   */
  async toggleExternalMark(
    userId: string,
    opportunityId: string,
    targetMarked?: boolean,
  ): Promise<{
    opportunityId: string;
    userId: string;
    isExternalMarked: boolean;
    status: 'EXTERNAL_MARKED' | 'REMOVED';
    sourceUrl?: string;
  }> {
    const opp = await this.opportunityRepo.findById(opportunityId);
    if (!opp) {
      throw DomainException.notFound('Cơ hội');
    }

    if (opp.applyMode !== 'EXTERNAL') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Chỉ cơ hội EXTERNAL mới hỗ trợ tự đánh dấu nộp tại nguồn ngoài',
      );
    }

    const key = `${userId}:${opportunityId}`;
    let existing: any = null;
    if (this.externalRegModel) {
      try {
        existing = await this.externalRegModel.findOne({ userId, opportunityId });
      } catch {}
    } else {
      existing = this.memoryExternalRegs.get(key) || null;
    }

    let newStatus: 'EXTERNAL_MARKED' | 'REMOVED';

    if (typeof targetMarked === 'boolean') {
      newStatus = targetMarked ? 'EXTERNAL_MARKED' : 'REMOVED';
    } else {
      newStatus = existing?.status === 'EXTERNAL_MARKED' ? 'REMOVED' : 'EXTERNAL_MARKED';
    }

    if (existing) {
      existing.status = newStatus;
      if (typeof existing.save === 'function') await existing.save();
      this.memoryExternalRegs.set(key, existing);
    } else {
      const record = {
        id: `ext_reg_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        userId,
        opportunityId,
        status: newStatus,
      };
      if (this.externalRegModel) {
        try {
          await this.externalRegModel.create(record);
        } catch {}
      }
      this.memoryExternalRegs.set(key, record);
    }

    return {
      opportunityId,
      userId,
      isExternalMarked: newStatus === 'EXTERNAL_MARKED',
      status: newStatus,
      sourceUrl: opp.props.sourceUrl,
    };
  }

  async getExternalMarkStatus(
    userId: string,
    opportunityId: string,
  ): Promise<{
    opportunityId: string;
    userId: string;
    isExternalMarked: boolean;
    status: string;
    sourceUrl?: string;
  }> {
    const opp = await this.opportunityRepo.findById(opportunityId);
    if (!opp) {
      throw DomainException.notFound('Cơ hội');
    }

    let existing: any = null;
    if (this.externalRegModel) {
      try {
        existing = await this.externalRegModel.findOne({ userId, opportunityId });
      } catch {}
    } else {
      existing = this.memoryExternalRegs.get(`${userId}:${opportunityId}`) || null;
    }

    return {
      opportunityId,
      userId,
      isExternalMarked: existing?.status === 'EXTERNAL_MARKED',
      status: existing?.status || 'UNMARKED',
      sourceUrl: opp.props.sourceUrl,
    };
  }
}
