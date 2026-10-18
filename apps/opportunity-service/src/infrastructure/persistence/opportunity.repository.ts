import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IOpportunityRepository, OpportunityFilter } from '../../domain/ports/opportunity.repository.port';
import { Opportunity, OpportunityType, OpportunityStatus, ApplyMode } from '../../domain/opportunity.entity';
import { OpportunityModel, OpportunityDocument } from './opportunity.schema';

@Injectable()
export class MongooseOpportunityRepository implements IOpportunityRepository {
  constructor(
    @InjectModel(OpportunityModel.name)
    private readonly model: Model<OpportunityDocument>,
  ) {}

  async findById(id: string): Promise<Opportunity | null> {
    const doc = await this.model.findOne({ id }).exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findMany(filter: OpportunityFilter): Promise<Opportunity[]> {
    const query: any = {};
    if (filter.type) query.type = filter.type;
    if (filter.status) query.status = filter.status;
    if (filter.applyMode) query.applyMode = filter.applyMode;
    if (filter.keyword) {
      query.title = { $regex: filter.keyword, $options: 'i' };
    }

    const limit = filter.limit || 10;
    const docs = await this.model
      .find(query)
      .sort({ registerDeadline: 1, _id: 1 })
      .limit(limit)
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
      eligibilityRules: opportunity.props.eligibilityRules,
      tags: opportunity.props.tags,
      version: opportunity.version,
    });
  }

  async update(opportunity: Opportunity): Promise<void> {
    await this.model
      .updateOne(
        { id: opportunity.id },
        {
          title: opportunity.title,
          description: opportunity.props.description,
          status: opportunity.status,
          registerDeadline: opportunity.registerDeadline,
          submitDeadline: opportunity.props.submitDeadline,
          version: opportunity.version,
        },
      )
      .exec();
  }

  private toDomain(doc: OpportunityDocument): Opportunity {
    return new Opportunity(doc.id, {
      type: doc.type as OpportunityType,
      title: doc.title,
      description: doc.description,
      organizationId: doc.organizationId,
      organizerName: doc.organizerName,
      sourceUrl: doc.sourceUrl,
      applyMode: doc.applyMode as ApplyMode,
      status: doc.status as OpportunityStatus,
      registerDeadline: doc.registerDeadline,
      submitDeadline: doc.submitDeadline,
      timezone: doc.timezone,
      fundingLevel: doc.fundingLevel as any,
      competitionMode: doc.competitionMode as any,
      minTeamSize: doc.minTeamSize,
      maxTeamSize: doc.maxTeamSize,
      eligibilityRules: doc.eligibilityRules,
      tags: doc.tags,
      version: doc.version,
    });
  }
}
