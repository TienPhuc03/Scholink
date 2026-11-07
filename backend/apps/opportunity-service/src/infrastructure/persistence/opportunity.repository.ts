import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaginationHelper } from '@shared';
import {
  IOpportunityRepository,
  OpportunityCursor,
  OpportunityFilter,
} from '../../domain/ports/opportunity.repository.port';
import {
  Opportunity,
  OpportunityType,
  OpportunityStatus,
  ApplyMode,
  FundingLevel,
} from '../../domain/opportunity.entity';
import { OpportunityModel, OpportunityDocument } from './opportunity.schema';

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class MongooseOpportunityRepository implements IOpportunityRepository {
  constructor(
    @InjectModel(OpportunityModel.name)
    private readonly model: Model<OpportunityDocument>,
  ) {}

  async findById(id: string): Promise<Opportunity | null> {
    const doc = await this.model.findOne({ id: { $eq: String(id) } }).lean().exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findMany(filter: OpportunityFilter): Promise<Opportunity[]> {
    const and: Record<string, unknown>[] = [];
    if (filter.type) and.push({ type: { $eq: String(filter.type) } });
    if (filter.status) and.push({ status: { $eq: String(filter.status) } });
    if (filter.applyMode) and.push({ applyMode: { $eq: String(filter.applyMode) } });
    if (filter.fundingLevel) and.push({ fundingLevel: { $eq: String(filter.fundingLevel) } });
    if (filter.organizationId) and.push({ organizationId: { $eq: String(filter.organizationId) } });
    if (filter.keyword && filter.keyword.trim()) {
      const re = { $regex: escapeRegex(filter.keyword.trim()), $options: 'i' };
      and.push({ $or: [{ title: re }, { organizerName: re }, { tags: re }] });
    }
    // BR11: closed at the deadline instant, so "open" means strictly after now.
    if (filter.openOnly) and.push({ registerDeadline: { $gt: filter.now ?? new Date() } });

    // Keyset pagination on (registerDeadline, id): the next page starts right after the cursor.
    const cursor = PaginationHelper.decodeCursor<OpportunityCursor>(filter.cursor);
    if (cursor?.d && cursor?.id) {
      const after = new Date(cursor.d);
      if (!isNaN(after.getTime())) {
        and.push({
          $or: [
            { registerDeadline: { $gt: after } },
            { registerDeadline: after, id: { $gt: String(cursor.id) } },
          ],
        });
      }
    }

    const query = and.length > 0 ? { $and: and } : {};
    const limit = Math.min(Math.max(filter.limit || 10, 1), 101);
    const docs = await this.model
      .find(query)
      .sort({ registerDeadline: 1, id: 1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map((doc) => this.toDomain(doc));
  }

  async save(opportunity: Opportunity): Promise<void> {
    await this.model.create({
      id: opportunity.id,
      type: opportunity.type,
      title: opportunity.title,
      slug: opportunity.props.slug,
      description: opportunity.props.description,
      benefits: opportunity.props.benefits,
      requirements: opportunity.props.requirements,
      organizationId: opportunity.props.organizationId,
      createdBy: opportunity.props.createdBy,
      organizerName: opportunity.props.organizerName,
      sourceUrl: opportunity.props.sourceUrl,
      applyMode: opportunity.applyMode,
      status: opportunity.status,
      registerDeadline: opportunity.registerDeadline,
      submitDeadline: opportunity.props.submitDeadline,
      timezone: opportunity.props.timezone,
      fundingLevel: opportunity.props.fundingLevel,
      minGpa: opportunity.props.minGpa ?? 0.0,
      requiredIelts: opportunity.props.requiredIelts ?? 0.0,
      coverImageUrl: opportunity.props.coverImageUrl,
      isPromoted: opportunity.props.isPromoted ?? false,
      competitionMode: opportunity.props.competitionMode,
      minTeamSize: opportunity.props.minTeamSize,
      maxTeamSize: opportunity.props.maxTeamSize,
      eligibilityRules: opportunity.props.eligibilityRules
        ? [...opportunity.props.eligibilityRules]
        : [],
      requiredFields: opportunity.props.requiredFields
        ? [...opportunity.props.requiredFields]
        : [],
      tags: opportunity.props.tags ? [...opportunity.props.tags] : [],
      dedupKey: opportunity.props.dedupKey,
      rawPayload: opportunity.props.rawPayload,
      confidenceScore: opportunity.props.confidenceScore,
      confidenceBreakdown: opportunity.props.confidenceBreakdown,
      reviewReason: opportunity.props.reviewReason,
      candidateMergeIds: opportunity.props.candidateMergeIds ? [...opportunity.props.candidateMergeIds] : [],
      reviewedBy: opportunity.props.reviewedBy,
      reviewedAt: opportunity.props.reviewedAt,
      ruleVersion: opportunity.ruleVersion,
      version: opportunity.version,
    });
  }

  async update(opportunity: Opportunity): Promise<void> {
    await this.model
      .updateOne(
        { id: { $eq: String(opportunity.id) } },
        {
          $set: {
            title: opportunity.title,
            description: opportunity.props.description,
            status: opportunity.status,
            registerDeadline: opportunity.registerDeadline,
            submitDeadline: opportunity.props.submitDeadline,
            timezone: opportunity.props.timezone,
            fundingLevel: opportunity.props.fundingLevel,
            competitionMode: opportunity.props.competitionMode,
            minTeamSize: opportunity.props.minTeamSize,
            maxTeamSize: opportunity.props.maxTeamSize,
            benefits: opportunity.props.benefits,
            requirements: opportunity.props.requirements,
            tags: opportunity.props.tags ? [...opportunity.props.tags] : [],
            reviewedBy: opportunity.props.reviewedBy,
            reviewedAt: opportunity.props.reviewedAt,
            reviewReason: opportunity.props.reviewReason,
            candidateMergeIds: opportunity.props.candidateMergeIds ? [...opportunity.props.candidateMergeIds] : [],
            ruleVersion: opportunity.ruleVersion,
            version: opportunity.version,
          },
        },
      )
      .exec();
  }

  private toDomain(doc: {
    id: string;
    type: string;
    title: string;
    slug?: string;
    description: string;
    benefits?: string;
    requirements?: string;
    organizationId?: string;
    createdBy?: string;
    organizerName: string;
    sourceUrl?: string;
    applyMode: string;
    status: string;
    registerDeadline: Date;
    submitDeadline?: Date;
    timezone: string;
    fundingLevel?: string;
    minGpa?: number;
    requiredIelts?: number;
    coverImageUrl?: string;
    isPromoted?: boolean;
    competitionMode?: string;
    minTeamSize?: number;
    maxTeamSize?: number;
    eligibilityRules?: Record<string, unknown>[];
    requiredFields?: string[];
    tags?: string[];
    dedupKey?: string;
    rawPayload?: Record<string, unknown>;
    confidenceScore?: number;
    confidenceBreakdown?: Record<string, number>;
    reviewReason?: string;
    candidateMergeIds?: string[];
    reviewedBy?: string;
    reviewedAt?: Date;
    ruleVersion?: number;
    version: number;
  }): Opportunity {
    return new Opportunity(doc.id, {
      type: doc.type as OpportunityType,
      title: doc.title,
      slug: doc.slug,
      description: doc.description,
      benefits: doc.benefits,
      requirements: doc.requirements,
      organizationId: doc.organizationId,
      createdBy: doc.createdBy,
      organizerName: doc.organizerName,
      sourceUrl: doc.sourceUrl,
      applyMode: doc.applyMode as ApplyMode,
      status: doc.status as OpportunityStatus,
      registerDeadline: new Date(doc.registerDeadline),
      submitDeadline: doc.submitDeadline ? new Date(doc.submitDeadline) : undefined,
      timezone: doc.timezone,
      fundingLevel: doc.fundingLevel as FundingLevel | undefined,
      minGpa: doc.minGpa,
      requiredIelts: doc.requiredIelts,
      coverImageUrl: doc.coverImageUrl,
      isPromoted: doc.isPromoted,
      competitionMode: doc.competitionMode as 'INDIVIDUAL' | 'TEAM' | undefined,
      minTeamSize: doc.minTeamSize,
      maxTeamSize: doc.maxTeamSize,
      eligibilityRules: doc.eligibilityRules,
      requiredFields: doc.requiredFields,
      tags: doc.tags,
      dedupKey: doc.dedupKey,
      rawPayload: doc.rawPayload,
      confidenceScore: doc.confidenceScore,
      confidenceBreakdown: doc.confidenceBreakdown,
      reviewReason: doc.reviewReason,
      candidateMergeIds: doc.candidateMergeIds,
      reviewedBy: doc.reviewedBy,
      reviewedAt: doc.reviewedAt,
      ruleVersion: doc.ruleVersion ?? 1,
      version: doc.version,
    });
  }
}
