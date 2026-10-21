import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ITeamRepository,
  ActiveMembershipRecord,
} from '../../domain/ports/team.repository.port';
import { Team, TeamStatus } from '../../domain/team.entity';
import { JoinRequest, JoinRequestStatus } from '../../domain/join-request.entity';
import { SubmissionReservation, ReservationStatus } from '../../domain/reservation.entity';
import {
  TeamModel,
  TeamDocument,
  ActiveMembershipModel,
  ActiveMembershipDocument,
  JoinRequestModel,
  JoinRequestDocument,
  SubmissionReservationModel,
  SubmissionReservationDocument,
} from './team.schema';

@Injectable()
export class MongooseTeamRepository implements ITeamRepository {
  constructor(
    @InjectModel(TeamModel.name) private readonly teamModel: Model<TeamDocument>,
    @InjectModel(ActiveMembershipModel.name) private readonly membershipModel: Model<ActiveMembershipDocument>,
    @InjectModel(JoinRequestModel.name) private readonly joinRequestModel: Model<JoinRequestDocument>,
    @InjectModel(SubmissionReservationModel.name) private readonly reservationModel: Model<SubmissionReservationDocument>,
  ) {}

  async findById(id: string): Promise<Team | null> {
    const doc = await this.teamModel.findOne({ id }).exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByCompetitionAndStudent(competitionId: string, studentId: string): Promise<Team | null> {
    const doc = await this.teamModel
      .findOne({
        competitionId,
        'members.studentId': studentId,
      })
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findManyByCompetition(competitionId: string): Promise<Team[]> {
    const docs = await this.teamModel.find({ competitionId }).exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(team: Team): Promise<void> {
    await this.teamModel.create({
      id: team.id,
      competitionId: team.competitionId,
      name: team.props.name,
      description: team.props.description,
      leaderId: team.leaderId,
      minSize: team.props.minSize,
      maxSize: team.props.maxSize,
      status: team.status,
      members: team.members as any,
      rosterVersion: team.rosterVersion,
      fencingToken: team.fencingToken,
      currentReservationId: team.currentReservationId,
      version: team.version,
    });
  }

  async update(team: Team): Promise<void> {
    await this.teamModel
      .updateOne(
        { id: team.id },
        {
          name: team.props.name,
          description: team.props.description,
          status: team.status,
          members: team.members as any,
          rosterVersion: team.rosterVersion,
          fencingToken: team.fencingToken,
          currentReservationId: team.currentReservationId,
          version: team.version,
        },
      )
      .exec();
  }

  // Active Memberships
  async saveActiveMembership(record: ActiveMembershipRecord): Promise<void> {
    await this.membershipModel.create(record);
  }

  async findActiveMembership(competitionId: string, studentId: string): Promise<ActiveMembershipRecord | null> {
    const doc = await this.membershipModel.findOne({ competitionId, studentId }).exec();
    if (!doc) return null;
    return {
      id: doc.id,
      studentId: doc.studentId,
      competitionId: doc.competitionId,
      teamId: doc.teamId,
      role: doc.role,
      joinedAt: doc.joinedAt,
    };
  }

  async deleteActiveMembership(competitionId: string, studentId: string): Promise<void> {
    await this.membershipModel.deleteOne({ competitionId, studentId }).exec();
  }

  // Join Requests
  async saveJoinRequest(request: JoinRequest): Promise<void> {
    await this.joinRequestModel.create({
      id: request.id,
      teamId: request.teamId,
      competitionId: request.competitionId,
      applicantId: request.applicantId,
      message: request.props.message,
      status: request.status,
      appliedAt: request.props.appliedAt,
      reviewedAt: request.props.reviewedAt,
      reviewedBy: request.props.reviewedBy,
    });
  }

  async findJoinRequestById(id: string): Promise<JoinRequest | null> {
    const doc = await this.joinRequestModel.findOne({ id }).exec();
    if (!doc) return null;
    return new JoinRequest(doc.id, {
      teamId: doc.teamId,
      competitionId: doc.competitionId,
      applicantId: doc.applicantId,
      message: doc.message,
      status: doc.status as JoinRequestStatus,
      appliedAt: doc.appliedAt,
      reviewedAt: doc.reviewedAt,
      reviewedBy: doc.reviewedBy,
    });
  }

  async findPendingJoinRequest(teamId: string, applicantId: string): Promise<JoinRequest | null> {
    const doc = await this.joinRequestModel.findOne({ teamId, applicantId, status: 'PENDING' }).exec();
    if (!doc) return null;
    return new JoinRequest(doc.id, {
      teamId: doc.teamId,
      competitionId: doc.competitionId,
      applicantId: doc.applicantId,
      message: doc.message,
      status: doc.status as JoinRequestStatus,
      appliedAt: doc.appliedAt,
      reviewedAt: doc.reviewedAt,
      reviewedBy: doc.reviewedBy,
    });
  }

  async findJoinRequestsByTeam(teamId: string): Promise<JoinRequest[]> {
    const docs = await this.joinRequestModel.find({ teamId }).sort({ appliedAt: -1 }).exec();
    return docs.map(
      (doc) =>
        new JoinRequest(doc.id, {
          teamId: doc.teamId,
          competitionId: doc.competitionId,
          applicantId: doc.applicantId,
          message: doc.message,
          status: doc.status as JoinRequestStatus,
          appliedAt: doc.appliedAt,
          reviewedAt: doc.reviewedAt,
          reviewedBy: doc.reviewedBy,
        }),
    );
  }

  async updateJoinRequest(request: JoinRequest): Promise<void> {
    await this.joinRequestModel
      .updateOne(
        { id: request.id },
        {
          status: request.status,
          reviewedAt: request.props.reviewedAt,
          reviewedBy: request.props.reviewedBy,
        },
      )
      .exec();
  }

  // Submission Reservations
  async saveReservation(reservation: SubmissionReservation): Promise<void> {
    await this.reservationModel.create({
      id: reservation.id,
      teamId: reservation.teamId,
      competitionId: reservation.competitionId,
      fencingToken: reservation.fencingToken,
      rosterVersion: reservation.rosterVersion,
      members: reservation.members as any,
      leaseExpiresAt: reservation.leaseExpiresAt,
      status: reservation.status,
      consents: reservation.consents as any,
    });
  }

  async findReservationById(id: string): Promise<SubmissionReservation | null> {
    const doc = await this.reservationModel.findOne({ id }).exec();
    if (!doc) return null;
    return new SubmissionReservation(doc.id, {
      teamId: doc.teamId,
      competitionId: doc.competitionId,
      fencingToken: doc.fencingToken,
      rosterVersion: doc.rosterVersion,
      members: doc.members,
      leaseExpiresAt: doc.leaseExpiresAt,
      status: doc.status as ReservationStatus,
      consents: doc.consents as any,
      createdAt: (doc as any).createdAt,
      updatedAt: (doc as any).updatedAt,
    });
  }

  async findActiveReservationByTeam(teamId: string): Promise<SubmissionReservation | null> {
    const doc = await this.reservationModel.findOne({ teamId, status: 'PENDING' }).exec();
    if (!doc) return null;
    return new SubmissionReservation(doc.id, {
      teamId: doc.teamId,
      competitionId: doc.competitionId,
      fencingToken: doc.fencingToken,
      rosterVersion: doc.rosterVersion,
      members: doc.members,
      leaseExpiresAt: doc.leaseExpiresAt,
      status: doc.status as ReservationStatus,
      consents: doc.consents as any,
      createdAt: (doc as any).createdAt,
      updatedAt: (doc as any).updatedAt,
    });
  }

  async findExpiredPendingReservations(): Promise<SubmissionReservation[]> {
    const docs = await this.reservationModel
      .find({
        status: 'PENDING',
        leaseExpiresAt: { $lt: new Date() },
      })
      .exec();

    return docs.map(
      (doc) =>
        new SubmissionReservation(doc.id, {
          teamId: doc.teamId,
          competitionId: doc.competitionId,
          fencingToken: doc.fencingToken,
          rosterVersion: doc.rosterVersion,
          members: doc.members,
          leaseExpiresAt: doc.leaseExpiresAt,
          status: doc.status as ReservationStatus,
          consents: doc.consents as any,
          createdAt: (doc as any).createdAt,
          updatedAt: (doc as any).updatedAt,
        }),
    );
  }

  async updateReservation(reservation: SubmissionReservation): Promise<void> {
    await this.reservationModel
      .updateOne(
        { id: reservation.id },
        {
          status: reservation.status,
          consents: reservation.consents as any,
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
      rosterVersion: doc.rosterVersion || 1,
      fencingToken: doc.fencingToken || 0,
      currentReservationId: doc.currentReservationId,
      version: doc.version,
    });
  }
}
