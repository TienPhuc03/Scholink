import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ITeamRepository } from '../../domain/ports/team.repository.port';
import { Team, TeamStatus } from '../../domain/team.entity';
import { TeamModel, TeamDocument } from './team.schema';

@Injectable()
export class MongooseTeamRepository implements ITeamRepository {
  constructor(
    @InjectModel(TeamModel.name) private readonly model: Model<TeamDocument>,
  ) {}

  async findById(id: string): Promise<Team | null> {
    const doc = await this.model.findOne({ id }).exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByCompetitionAndStudent(competitionId: string, studentId: string): Promise<Team | null> {
    const doc = await this.model
      .findOne({
        competitionId,
        'members.studentId': studentId,
      })
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findManyByCompetition(competitionId: string): Promise<Team[]> {
    const docs = await this.model.find({ competitionId }).exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(team: Team): Promise<void> {
    await this.model.create({
      id: team.id,
      competitionId: team.competitionId,
      name: team.props.name,
      description: team.props.description,
      leaderId: team.leaderId,
      minSize: team.props.minSize,
      maxSize: team.props.maxSize,
      status: team.status,
      members: team.members as any,
      version: team.version,
    });
  }

  async update(team: Team): Promise<void> {
    await this.model
      .updateOne(
        { id: team.id },
        {
          name: team.props.name,
          description: team.props.description,
          status: team.status,
          members: team.members as any,
          version: team.version,
        },
      )
      .exec();
  }

  private toDomain(doc: TeamDocument): Team {
    return new Team(doc.id, {
      competitionId: doc.competitionId,
      name: doc.name,
      description: doc.description,
      leaderId: doc.leaderId,
      minSize: doc.minSize,
      maxSize: doc.maxSize,
      status: doc.status as TeamStatus,
      members: doc.members as any,
      version: doc.version,
    });
  }
}
