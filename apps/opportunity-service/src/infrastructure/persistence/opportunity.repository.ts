import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IOpportunityRepository,
  OpportunityFilter,
} from '../../domain/ports/opportunity.repository.port';
import {
  Opportunity,
  OpportunityType,
  OpportunityStatus,
  ApplyMode,
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
    const query: Record<string, unknown> = {};
    if (filter.type) query.type = { $eq: String(filter.type) };
    if (filter.status) query.status = { $eq: String(filter.status) };
    if (filter.applyMode) query.applyMode = { $eq: String(filter.applyMode) };
    if (filter.keyword && filter.keyword.trim()) {
      query.title = { $regex: escapeRegex(filter.keyword.trim()), $options: 'i' };
    }

    const limit = Math.min(Math.max(filter.limit || 10, 1), 51);
    const docs = await this.model
      .find(query)
      .sort({ registerDeadline: 1, _id: 1 })
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
      description: opportunity.props.description,
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
    description: string;
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
    competitionMode?: string;
    minTeamSize?: number;
    maxTeamSize?: number;
    eligibilityRules?: Record<string, unknown>[];
    requiredFields?: string[];
    tags?: string[];
    ruleVersion?: number;
    version: number;
  }): Opportunity {
    return new Opportunity(doc.id, {
      type: doc.type as OpportunityType,
      title: doc.title,
      description: doc.description,
      organizationId: doc.organizationId,
      createdBy: doc.createdBy,
      organizerName: doc.organizerName,
      sourceUrl: doc.sourceUrl,
      applyMode: doc.applyMode as ApplyMode,
      status: doc.status as OpportunityStatus,
      registerDeadline: new Date(doc.registerDeadline),
      submitDeadline: doc.submitDeadline ? new Date(doc.submitDeadline) : undefined,
      timezone: doc.timezone,
      fundingLevel: doc.fundingLevel as 'FULL' | 'PARTIAL' | 'OTHER' | undefined,
      competitionMode: doc.competitionMode as 'INDIVIDUAL' | 'TEAM' | undefined,
      minTeamSize: doc.minTeamSize,
      maxTeamSize: doc.maxTeamSize,
      eligibilityRules: doc.eligibilityRules,
      requiredFields: doc.requiredFields,
      tags: doc.tags,
      ruleVersion: doc.ruleVersion ?? 1,
      version: doc.version,
    });
  }
}
