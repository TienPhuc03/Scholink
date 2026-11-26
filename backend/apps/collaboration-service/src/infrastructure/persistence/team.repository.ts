import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, ClientSession } from 'mongoose';
import {
  ITeamRepository,
  ActiveMembershipRecord,
} from '../../domain/ports/team.repository.port';
import { Team, TeamStatus } from '../../domain/team.entity';
import { JoinRequest, JoinRequestStatus } from '../../domain/join-request.entity';
import { SubmissionReservation, ReservationStatus } from '../../domain/reservation.entity';
import { DomainException, ErrorCode } from '@shared';
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
import {
  ChatRoomModel,
  ChatRoomDocument,
  OutboxModel,
  OutboxDocument,
} from './chat.schema';

const isDuplicateKeyError = (err: unknown): boolean =>
  Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: number }).code === 11000,
  );

const isTransactionUnsupportedError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as { message?: string }).message ?? '');
  return (
    msg.includes('Transaction numbers are only allowed on a replica set') ||
    msg.includes('replica set') ||
    msg.includes('transactions are not supported') ||
    (err as { code?: number }).code === 20 ||
    (err as { code?: number }).code === 263
  );
};

@Injectable()
export class MongooseTeamRepository implements ITeamRepository {
  private readonly logger = new Logger(MongooseTeamRepository.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(TeamModel.name) private readonly teamModel: Model<TeamDocument>,
    @InjectModel(ActiveMembershipModel.name) private readonly membershipModel: Model<ActiveMembershipDocument>,
    @InjectModel(JoinRequestModel.name) private readonly joinRequestModel: Model<JoinRequestDocument>,
    @InjectModel(SubmissionReservationModel.name) private readonly reservationModel: Model<SubmissionReservationDocument>,
    @InjectModel(ChatRoomModel.name) private readonly roomModel: Model<ChatRoomDocument>,
    @InjectModel(OutboxModel.name) private readonly outboxModel: Model<OutboxDocument>,
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

  async findManyByCompetition(
    competitionId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<Team[]> {
    const query: Record<string, unknown> = { competitionId };
    if (options?.cursor) {
      query.id = { $gt: String(options.cursor) };
    }
    const safeLimit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const docs = await this.teamModel
      .find(query)
      .sort({ id: 1 })
      .limit(safeLimit)
      .exec();
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
      avatarUrl: team.props.avatarUrl,
      bannerImageUrl: team.props.bannerImageUrl,
      version: team.version,
    });
  }

  async update(team: Team): Promise<void> {
    const expectedVersion = team.version - 1;
    const res = await this.teamModel
      .updateOne(
        { id: team.id, version: { $in: [team.version, expectedVersion] } },
        {
          $set: {
            name: team.props.name,
            description: team.props.description,
            minSize: team.props.minSize,
            maxSize: team.props.maxSize,
            status: team.status,
            members: team.members as any,
            rosterVersion: team.rosterVersion,
            fencingToken: team.fencingToken,
            currentReservationId: team.currentReservationId,
            avatarUrl: team.props.avatarUrl,
            bannerImageUrl: team.props.bannerImageUrl,
            version: team.version,
          },
        },
      )
      .exec();

    if (res.matchedCount === 0) {
      const existing = await this.teamModel.findOne({ id: team.id }).exec();
      if (!existing) {
        throw DomainException.notFound('Đội thi');
      }
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        'Đội thi vừa được cập nhật bởi thao tác khác. Vui lòng tải lại trang.',
        409,
      );
    }
  }

  async conditionalPrepareSubmission(
    teamId: string,
    leaderId: string,
    reservationId: string,
    currentVersion: number,
    nextFencingToken: number,
    nextRosterVersion: number,
  ): Promise<Team | null> {
    const doc = await this.teamModel
      .findOneAndUpdate(
        {
          id: teamId,
          leaderId: leaderId,
          status: { $in: ['FORMING', 'ACTIVE'] },
          version: currentVersion,
        },
        {
          $set: {
            status: 'SUBMITTING',
            currentReservationId: reservationId,
            fencingToken: nextFencingToken,
            rosterVersion: nextRosterVersion,
          },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();

    if (!doc) return null;
    return this.toDomain(doc);
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

  async cancelPendingJoinRequests(studentId: string, competitionId: string, exceptRequestId?: string): Promise<void> {
    const filter: any = {
      applicantId: studentId,
      competitionId,
      status: 'PENDING',
    };
    if (exceptRequestId) {
      filter.id = { $ne: exceptRequestId };
    }
    await this.joinRequestModel
      .updateMany(filter, {
        $set: {
          status: 'WITHDRAWN',
          reviewedAt: new Date(),
        },
      })
      .exec();
  }

  async acceptJoinRequestInTransaction(params: {
    team: Team;
    joinRequest: JoinRequest;
    activeMembership: ActiveMembershipRecord;
    outboxEvent?: any;
  }): Promise<void> {
    const { team, joinRequest, activeMembership, outboxEvent } = params;

    const runWork = async (session?: ClientSession) => {
      // 1. Ghi active_memberships TRƯỚC (kiểm tra unique constraint {competitionId, studentId})
      try {
        await this.membershipModel.create(
          [activeMembership],
          session ? { session } : undefined,
        );
      } catch (err: unknown) {
        if (isDuplicateKeyError(err)) {
          throw new DomainException(
            ErrorCode.STATE_CONFLICT,
            'Ứng viên đã gia nhập đội thi khác trong cuộc thi này',
            409,
          );
        }
        throw err;
      }

      // 2. Cập nhật Team với Optimistic Locking theo version
      const expectedVersion = team.version - 1; // version đã increment trong entity addMember
      const teamUpdateRes = await this.teamModel.updateOne(
        { id: team.id, version: { $in: [team.version, expectedVersion] } },
        {
          $set: {
            members: team.members as any,
            rosterVersion: team.rosterVersion,
            status: team.status,
            version: team.version,
          },
        },
        session ? { session } : undefined,
      );

      if (teamUpdateRes.matchedCount === 0) {
        throw new DomainException(
          ErrorCode.STATE_CONFLICT,
          'Đội thi vừa được cập nhật bởi thao tác khác. Vui lòng tải lại trang.',
          409,
        );
      }

      // 3. Cập nhật JoinRequest sang ACCEPTED
      await this.joinRequestModel.updateOne(
        { id: joinRequest.id },
        {
          $set: {
            status: 'ACCEPTED',
            reviewedAt: joinRequest.props.reviewedAt || new Date(),
            reviewedBy: joinRequest.props.reviewedBy,
          },
        },
        session ? { session } : undefined,
      );

      // 4. Thêm thành viên vào ChatRoom của đội
      await this.roomModel.updateOne(
        { refId: team.id },
        {
          $addToSet: { participants: joinRequest.applicantId },
        },
        session ? { session } : undefined,
      );

      // 5. Tự động hủy các yêu cầu gia nhập PENDING khác của ứng viên trong cùng cuộc thi (T2)
      await this.joinRequestModel.updateMany(
        {
          applicantId: joinRequest.applicantId,
          competitionId: team.competitionId,
          status: 'PENDING',
          id: { $ne: joinRequest.id },
        },
        {
          $set: {
            status: 'WITHDRAWN',
            reviewedAt: new Date(),
          },
        },
        session ? { session } : undefined,
      );

      // 6. Ghi Outbox thông báo nếu có (T6)
      if (outboxEvent) {
        await this.outboxModel.create(
          [outboxEvent],
          session ? { session } : undefined,
        );
      }
    };

    let session: ClientSession | null = null;
    try {
      session = await this.connection.startSession();
      await session.withTransaction(async () => {
        await runWork(session!);
      });
    } catch (err: unknown) {
      if (err instanceof DomainException) {
        throw err;
      }
      if (isDuplicateKeyError(err)) {
        throw new DomainException(
          ErrorCode.STATE_CONFLICT,
          'Ứng viên đã gia nhập đội thi khác trong cuộc thi này',
          409,
        );
      }
      if (isTransactionUnsupportedError(err)) {
        await runWork(undefined);
        return;
      }
      throw err;
    } finally {
      if (session) {
        await session.endSession().catch(() => {});
      }
    }
  }

  async saveOutboxEvent(event: any): Promise<void> {
    await this.outboxModel.create(event);
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

  async delete(id: string): Promise<void> {
    await this.teamModel.deleteOne({ id }).exec();
  }

  async deleteActiveMembershipsByTeam(teamId: string): Promise<void> {
    await this.membershipModel.deleteMany({ teamId }).exec();
  }

  async deleteJoinRequestsByTeam(teamId: string): Promise<void> {
    await this.joinRequestModel.deleteMany({ teamId }).exec();
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
      avatarUrl: doc.avatarUrl,
      bannerImageUrl: doc.bannerImageUrl,
      version: doc.version,
    });
  }
}
