import { Injectable, Inject, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ITeamRepository, TEAM_REPOSITORY } from '../../domain/ports/team.repository.port';
import { IChatRepository, CHAT_REPOSITORY } from '../../domain/ports/chat.repository.port';
import { Team } from '../../domain/team.entity';
import { JoinRequest } from '../../domain/join-request.entity';
import { SubmissionReservation } from '../../domain/reservation.entity';
import { ChatRoom } from '../../domain/chat.entity';
import {
  CreateTeamDto,
  CreateJoinRequestDto,
  ReviewJoinRequestDto,
  TransferLeaderDto,
  SubmitTeamConsentDto,
} from '../dtos/collaboration.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class TeamUseCase {
  private readonly logger = new Logger(TeamUseCase.name);

  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teamRepo: ITeamRepository,
    @Inject(CHAT_REPOSITORY) private readonly chatRepo: IChatRepository,
  ) {}

  async createTeam(studentId: string, dto: CreateTeamDto) {
    const existingMembership = await this.teamRepo.findActiveMembership(dto.competitionId, studentId);
    if (existingMembership) {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        'Bạn đã tham gia một đội thi trong cuộc thi này, không thể tạo thêm đội mới',
        409,
      );
    }

    const teamId = `team_${crypto.randomUUID()}`;
    const team = new Team(teamId, {
      competitionId: dto.competitionId,
      name: dto.name,
      description: dto.description,
      leaderId: studentId,
      minSize: dto.minSize,
      maxSize: dto.maxSize,
      status: 'FORMING',
      rosterVersion: 1,
      fencingToken: 0,
      members: [
        {
          studentId,
          role: 'LEADER',
          joinedAt: new Date(),
        },
      ],
    });

    await this.teamRepo.save(team);

    // Save Active Membership for Leader
    await this.teamRepo.saveActiveMembership({
      id: `mem_${crypto.randomUUID()}`,
      studentId,
      competitionId: dto.competitionId,
      teamId: team.id,
      role: 'LEADER',
      joinedAt: new Date(),
    });

    // Automatically create Group Chat Room for the team
    const chatRoom = new ChatRoom(`room_${crypto.randomUUID()}`, {
      type: 'TEAM',
      refId: teamId,
      participants: [studentId],
      lastSeq: 0,
    });
    await this.chatRepo.saveRoom(chatRoom);

    return {
      ...team.props,
      id: team.id,
      chatRoomId: chatRoom.id,
    };
  }

  async getTeamById(teamId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }
    return {
      ...team.props,
      id: team.id,
    };
  }

  async sendJoinRequest(teamId: string, applicantId: string, dto: CreateJoinRequestDto) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.status === 'SUBMITTING' || team.status === 'SUBMITTED' || team.status === 'CLOSED') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đội thi hiện không tiếp nhận thêm thành viên mới', 409);
    }

    if (team.members.length >= team.props.maxSize) {
      throw new DomainException(ErrorCode.SLOT_FULL, 'Đội thi đã đủ thành viên', 409);
    }

    const existingMembership = await this.teamRepo.findActiveMembership(team.competitionId, applicantId);
    if (existingMembership) {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        'Bạn đã là thành viên của một đội thi khác trong cuộc thi này',
        409,
      );
    }

    const pendingReq = await this.teamRepo.findPendingJoinRequest(teamId, applicantId);
    if (pendingReq) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Bạn đã gửi yêu cầu gia nhập đội này và đang chờ duyệt', 409);
    }

    const joinRequest = new JoinRequest(`req_${crypto.randomUUID()}`, {
      teamId,
      competitionId: team.competitionId,
      applicantId,
      message: dto.message,
      status: 'PENDING',
      appliedAt: new Date(),
    });

    await this.teamRepo.saveJoinRequest(joinRequest);

    return {
      ...joinRequest.props,
      id: joinRequest.id,
    };
  }

  async getJoinRequests(teamId: string, leaderId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.leaderId !== leaderId) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ trưởng đội mới có quyền xem yêu cầu gia nhập', 403);
    }

    const requests = await this.teamRepo.findJoinRequestsByTeam(teamId);
    return requests.map((r) => ({ ...r.props, id: r.id }));
  }

  async reviewJoinRequest(teamId: string, requestId: string, leaderId: string, dto: ReviewJoinRequestDto) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.leaderId !== leaderId) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ trưởng đội mới có quyền duyệt yêu cầu', 403);
    }

    const joinRequest = await this.teamRepo.findJoinRequestById(requestId);
    if (!joinRequest || joinRequest.teamId !== teamId) {
      throw DomainException.notFound('Yêu cầu gia nhập');
    }

    if (joinRequest.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Yêu cầu này đã được xử lý trước đó', 409);
    }

    if (dto.decision === 'ACCEPT') {
      // Atomic verification: check if slot is still available and applicant is not in another team
      if (team.members.length >= team.props.maxSize) {
        throw new DomainException(ErrorCode.SLOT_FULL, 'Đội thi đã đủ số lượng thành viên', 409);
      }

      const otherMembership = await this.teamRepo.findActiveMembership(team.competitionId, joinRequest.applicantId);
      if (otherMembership) {
        joinRequest.reject(leaderId);
        await this.teamRepo.updateJoinRequest(joinRequest);
        throw new DomainException(
          ErrorCode.STATE_CONFLICT,
          'Ứng viên đã gia nhập đội thi khác trong thời gian chờ duyệt',
          409,
        );
      }

      // Add to team & active membership
      team.addMember(joinRequest.applicantId);
      await this.teamRepo.update(team);

      await this.teamRepo.saveActiveMembership({
        id: `mem_${crypto.randomUUID()}`,
        studentId: joinRequest.applicantId,
        competitionId: team.competitionId,
        teamId: team.id,
        role: 'MEMBER',
        joinedAt: new Date(),
      });

      joinRequest.accept(leaderId);
      await this.teamRepo.updateJoinRequest(joinRequest);

      // Add member to Team Chat Room
      const room = await this.chatRepo.findRoomByRefId(team.id);
      if (room) {
        room.addParticipant(joinRequest.applicantId);
        await this.chatRepo.updateRoom(room);
      }
    } else {
      joinRequest.reject(leaderId);
      await this.teamRepo.updateJoinRequest(joinRequest);
    }

    return {
      requestId: joinRequest.id,
      status: joinRequest.status,
      teamMembers: team.members,
    };
  }

  async withdrawJoinRequest(requestId: string, applicantId: string) {
    const joinRequest = await this.teamRepo.findJoinRequestById(requestId);
    if (!joinRequest) {
      throw DomainException.notFound('Yêu cầu gia nhập');
    }

    joinRequest.withdraw(applicantId);
    await this.teamRepo.updateJoinRequest(joinRequest);

    return {
      requestId: joinRequest.id,
      status: joinRequest.status,
    };
  }

  async leaveTeam(teamId: string, studentId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    team.removeMember(studentId);
    await this.teamRepo.update(team);
    await this.teamRepo.deleteActiveMembership(team.competitionId, studentId);

    // Remove from Team Chat Room
    const room = await this.chatRepo.findRoomByRefId(team.id);
    if (room) {
      room.removeParticipant(studentId);
      await this.chatRepo.updateRoom(room);
    }

    return {
      teamId: team.id,
      members: team.members,
      status: team.status,
    };
  }

  async transferLeader(teamId: string, currentLeaderId: string, dto: TransferLeaderDto) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    team.transferLeader(dto.newLeaderId, currentLeaderId);
    await this.teamRepo.update(team);

    return {
      teamId: team.id,
      leaderId: team.leaderId,
      members: team.members,
    };
  }

  async getCompetitionTeams(competitionId: string) {
    const teams = await this.teamRepo.findManyByCompetition(competitionId);
    return teams.map((t) => ({ ...t.props, id: t.id }));
  }

  // ==========================================
  // F33: SUBMISSION RESERVATION & ROSTER FREEZE
  // ==========================================
  async prepareSubmission(teamId: string, leaderId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.leaderId !== leaderId) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ trưởng đội mới có quyền bắt đầu nộp hồ sơ đội', 403);
    }

    const reservationId = `res_${crypto.randomUUID()}`;
    const fencingToken = team.prepareSubmission(reservationId);
    await this.teamRepo.update(team);

    // 10 minutes lease for roster freeze
    const leaseExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const memberIds = team.members.map((m) => m.studentId);

    const reservation = new SubmissionReservation(reservationId, {
      teamId: team.id,
      competitionId: team.competitionId,
      fencingToken,
      rosterVersion: team.rosterVersion,
      members: memberIds,
      leaseExpiresAt,
      status: 'PENDING',
      consents: [],
    });

    await this.teamRepo.saveReservation(reservation);
    this.logger.log(`[RosterFreeze] Đội ${team.id} khóa nộp hồ sơ. Reservation: ${reservationId}, fencingToken: ${fencingToken}`);

    return {
      reservationId: reservation.id,
      teamId: team.id,
      competitionId: team.competitionId,
      fencingToken: reservation.fencingToken,
      rosterVersion: reservation.rosterVersion,
      members: reservation.members,
      leaseExpiresAt: reservation.leaseExpiresAt.toISOString(),
      status: reservation.status,
    };
  }

  async validateReservation(teamId: string, fencingToken: number) {
    const reservation = await this.teamRepo.findActiveReservationByTeam(teamId);
    if (!reservation) {
      return { isValid: false, status: 'NOT_FOUND', errorCode: 'RESERVATION_NOT_FOUND' };
    }
    if (reservation.fencingToken !== fencingToken) {
      return { isValid: false, status: 'STALE_FENCING_TOKEN', errorCode: 'FENCING_TOKEN_MISMATCH' };
    }
    if (new Date() > reservation.leaseExpiresAt) {
      return { isValid: false, status: 'EXPIRED', errorCode: 'LEASE_EXPIRED' };
    }
    return { isValid: true, status: 'VALID', errorCode: '' };
  }

  async submitTeamConsent(reservationId: string, studentId: string, dto: SubmitTeamConsentDto) {
    const reservation = await this.teamRepo.findReservationById(reservationId);
    if (!reservation) {
      throw DomainException.notFound('Phiên giữ chỗ nộp hồ sơ (Submission Reservation)');
    }

    reservation.addMemberConsent({
      studentId,
      consentId: `cst_${crypto.randomUUID()}`,
      snapshotId: dto.snapshotId,
      payloadHash: dto.payloadHash,
      confirmedAt: new Date(),
    });

    await this.teamRepo.updateReservation(reservation);

    return {
      reservationId: reservation.id,
      totalMembers: reservation.members.length,
      consentsCount: reservation.consents.length,
      hasAllConsents: reservation.hasAllConsents(),
      consents: reservation.consents,
    };
  }

  async confirmSubmission(reservationId: string) {
    const reservation = await this.teamRepo.findReservationById(reservationId);
    if (!reservation) {
      throw DomainException.notFound('Phiên giữ chỗ nộp hồ sơ');
    }

    reservation.confirm();
    await this.teamRepo.updateReservation(reservation);

    const team = await this.teamRepo.findById(reservation.teamId);
    if (team) {
      team.confirmSubmission(reservationId);
      await this.teamRepo.update(team);
    }

    this.logger.log(`[SubmissionConfirmed] Reservation ${reservationId} đã hoàn tất nộp cho đội ${reservation.teamId}`);

    return {
      reservationId: reservation.id,
      status: reservation.status,
      teamStatus: team ? team.status : 'SUBMITTED',
    };
  }

  async abortSubmission(reservationId: string) {
    const reservation = await this.teamRepo.findReservationById(reservationId);
    if (!reservation) {
      throw DomainException.notFound('Phiên giữ chỗ nộp hồ sơ');
    }

    reservation.abort();
    await this.teamRepo.updateReservation(reservation);

    const team = await this.teamRepo.findById(reservation.teamId);
    if (team) {
      team.abortSubmission(reservationId);
      await this.teamRepo.update(team);
    }

    this.logger.log(`[SubmissionAborted] Reservation ${reservationId} đã bị hủy, giải phóng Roster Freeze cho đội ${reservation.teamId}`);

    return {
      reservationId: reservation.id,
      status: reservation.status,
      teamStatus: team ? team.status : 'ACTIVE',
    };
  }
}
