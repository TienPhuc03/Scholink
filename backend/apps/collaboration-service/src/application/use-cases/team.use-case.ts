import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ITeamRepository, TEAM_REPOSITORY } from '../../domain/ports/team.repository.port';
import { IChatRepository, CHAT_REPOSITORY } from '../../domain/ports/chat.repository.port';
import {
  IIdentityClientPort,
  IDENTITY_CLIENT,
} from '../../domain/ports/identity-client.port';
import { Team } from '../../domain/team.entity';
import { JoinRequest } from '../../domain/join-request.entity';
import { SubmissionReservation } from '../../domain/reservation.entity';
import { ChatRoom } from '../../domain/chat.entity';
import {
  CreateTeamDto,
  UpdateTeamDto,
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
    @Optional()
    @Inject(IDENTITY_CLIENT)
    private readonly identityClient?: IIdentityClientPort,
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
      avatarUrl: dto.avatarUrl,
      bannerImageUrl: dto.bannerImageUrl,
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

    // Automatically create Group Chat Room for the team with team name
    const chatRoom = new ChatRoom(`room_${crypto.randomUUID()}`, {
      type: 'TEAM',
      refId: teamId,
      name: dto.name,
      participants: [studentId],
      lastSeq: 0,
    });
    await this.chatRepo.saveRoom(chatRoom);

    // T2: Tự động hủy các yêu cầu gia nhập PENDING khác của người tạo đội trong cùng cuộc thi
    await this.teamRepo.cancelPendingJoinRequests(studentId, dto.competitionId);

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

    // T5: Kèm tên đầy đủ và avatar cho từng thành viên
    const membersWithProfiles = await Promise.all(
      team.members.map(async (m) => {
        let fullName: string | undefined;
        let avatarUrl: string | undefined;
        try {
          if (this.identityClient?.getProfileView) {
            const profile = (await this.identityClient.getProfileView(m.studentId, 'TEAMMATES')) as any;
            fullName = profile?.fullName || undefined;
            avatarUrl = profile?.avatarUrl || undefined;
          }
        } catch {}
        return {
          ...m,
          fullName,
          avatarUrl,
        };
      }),
    );

    return {
      ...team.props,
      id: team.id,
      members: membersWithProfiles,
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

    // T6: Ghi Outbox thông báo cho đội trưởng khi có người gửi yêu cầu gia nhập
    await this.teamRepo.saveOutboxEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      aggregateType: 'TEAM',
      aggregateId: team.id,
      eventType: 'TEAM_JOIN_REQUEST',
      payload: {
        userId: team.leaderId,
        businessKey: `join_request:${joinRequest.id}:created`,
        type: 'TEAM_JOIN_REQUEST',
        title: `Có người xin vào đội ${team.props.name}`,
        body: dto.message ? `Lời nhắn: "${dto.message}"` : `Một sinh viên muốn tham gia đội ${team.props.name}`,
        refUrl: `/teams/${team.id}/join-requests`,
      },
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date(),
    });

    return {
      ...joinRequest.props,
      id: joinRequest.id,
    };
  }

  /** Pending requests the student sent, so the app can show "Đã gửi yêu cầu" after a reload. */
  async getMyPendingJoinRequests(applicantId: string) {
    const requests = await this.teamRepo.findPendingJoinRequestsByApplicant(applicantId);
    return requests.map((r) => ({ ...r.props, id: r.id }));
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

    // T4: Kèm tóm tắt hồ sơ người xin cho từng yêu cầu
    const enriched = await Promise.all(
      requests.map(async (r) => {
        let applicant: Record<string, any> | undefined;
        try {
          if (this.identityClient?.getProfileView) {
            const profile = (await this.identityClient.getProfileView(r.applicantId, 'TEAMMATES')) as any;
            if (profile) {
              const edu = profile.education || {};
              applicant = {
                fullName: profile.fullName || '',
                avatarUrl: profile.avatarUrl || '',
                institution: edu.institution || '',
                major: edu.major || '',
                startYear: edu.startYear,
                endYear: edu.endYear,
                gpa: edu.gpa,
                gpaScale: edu.gpaScale,
              };
            }
          }
        } catch {
          // Lỗi Identity thì bỏ qua tóm tắt, không làm hỏng cả danh sách
        }
        return {
          ...r.props,
          id: r.id,
          applicant,
        };
      }),
    );

    return enriched;
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

      team.addMember(joinRequest.applicantId);
      joinRequest.accept(leaderId);

      // T6: Chuẩn bị outbox event duyệt thành công
      const outboxEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        aggregateType: 'TEAM',
        aggregateId: team.id,
        eventType: 'TEAM_JOIN_REVIEWED',
        payload: {
          userId: joinRequest.applicantId,
          businessKey: `join_request:${joinRequest.id}:ACCEPTED`,
          type: 'TEAM_JOIN_REVIEWED',
          title: `Yêu cầu vào đội ${team.props.name} đã được chấp thuận!`,
          body: `Chúc mừng bạn đã trở thành thành viên chính thức của đội ${team.props.name}.`,
          refUrl: `/teams/${team.id}`,
        },
        status: 'PENDING',
        retryCount: 0,
        createdAt: new Date(),
      };

      // T3: Gói việc ghi active_memberships + cập nhật team + joinRequest + chat room + outbox vào transaction
      await this.teamRepo.acceptJoinRequestInTransaction({
        team,
        joinRequest,
        activeMembership: {
          id: `mem_${crypto.randomUUID()}`,
          studentId: joinRequest.applicantId,
          competitionId: team.competitionId,
          teamId: team.id,
          role: 'MEMBER',
          joinedAt: new Date(),
        },
        outboxEvent,
      });
    } else {
      joinRequest.reject(leaderId);
      await this.teamRepo.updateJoinRequest(joinRequest);

      // T6: Ghi outbox thông báo từ chối
      await this.teamRepo.saveOutboxEvent({
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        aggregateType: 'TEAM',
        aggregateId: team.id,
        eventType: 'TEAM_JOIN_REVIEWED',
        payload: {
          userId: joinRequest.applicantId,
          businessKey: `join_request:${joinRequest.id}:REJECTED`,
          type: 'TEAM_JOIN_REVIEWED',
          title: `Yêu cầu vào đội ${team.props.name} đã bị từ chối`,
          body: `Rất tiếc, yêu cầu gia nhập đội ${team.props.name} của bạn không được phê duyệt.`,
          refUrl: `/teams/${team.id}`,
        },
        status: 'PENDING',
        retryCount: 0,
        createdAt: new Date(),
      });
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

    // Invalidate any pending reservation if present
    const pendingRes = await this.teamRepo.findActiveReservationByTeam(team.id);
    if (pendingRes) {
      pendingRes.abort();
      await this.teamRepo.updateReservation(pendingRes);
    }

    await this.teamRepo.update(team);
    await this.teamRepo.deleteActiveMembership(team.competitionId, studentId);

    // Revoke from Team Chat Room immediately
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

    // Invalidate any pending reservation if present
    const pendingRes = await this.teamRepo.findActiveReservationByTeam(team.id);
    if (pendingRes) {
      pendingRes.abort();
      await this.teamRepo.updateReservation(pendingRes);
    }

    await this.teamRepo.update(team);

    return {
      teamId: team.id,
      leaderId: team.leaderId,
      members: team.members,
    };
  }

  async reopenTeamFromWithdrawal(teamId: string, leaderId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.leaderId !== leaderId) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ trưởng đội mới có quyền mở lại hồ sơ đội', 403);
    }

    team.reopenFromWithdrawal();
    await this.teamRepo.update(team);

    return {
      teamId: team.id,
      status: team.status,
      rosterVersion: team.rosterVersion,
    };
  }

  async getCompetitionTeams(
    competitionId: string,
    options?: { limit?: number; cursor?: string },
  ) {
    const safeLimit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const teams = await this.teamRepo.findManyByCompetition(competitionId, {
      limit: safeLimit,
      cursor: options?.cursor,
    });

    // T5: Lấy hàng loạt tên và avatar qua 1 lệnh gRPC batch (tránh N+1)
    const studentIds = Array.from(new Set(teams.flatMap((t) => t.members.map((m) => m.studentId))));
    const profileMap = new Map<string, { fullName?: string; avatarUrl?: string }>();

    if (studentIds.length > 0) {
      if (this.identityClient?.getProfileViews) {
        try {
          const profiles = await this.identityClient.getProfileViews(studentIds, 'TEAMMATES');
          for (const p of profiles as Array<{ studentId?: string; fullName?: string; avatarUrl?: string }>) {
            if (p?.studentId) {
              profileMap.set(p.studentId, {
                fullName: p.fullName || undefined,
                avatarUrl: p.avatarUrl || undefined,
              });
            }
          }
        } catch {}
      } else if (this.identityClient?.getProfileView) {
        await Promise.all(
          studentIds.map(async (studentId) => {
            try {
              const p = (await this.identityClient!.getProfileView!(studentId, 'TEAMMATES')) as any;
              profileMap.set(studentId, {
                fullName: p?.fullName || undefined,
                avatarUrl: p?.avatarUrl || undefined,
              });
            } catch {}
          }),
        );
      }
    }

    return teams.map((t) => ({
      ...t.props,
      id: t.id,
      members: t.members.map((m) => ({
        ...m,
        fullName: profileMap.get(m.studentId)?.fullName,
        avatarUrl: profileMap.get(m.studentId)?.avatarUrl,
      })),
    }));
  }

  // ==========================================
  // SCHOL-20: SUBMISSION RESERVATION & ROSTER FREEZE
  // ==========================================
  async prepareSubmission(teamId: string, leaderId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.leaderId !== leaderId) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ trưởng đội mới có quyền bắt đầu nộp hồ sơ đội', 403);
    }

    if (team.members.length < team.props.minSize || team.members.length > team.props.maxSize) {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        `Số lượng thành viên (${team.members.length}) không đạt yêu cầu [${team.props.minSize} - ${team.props.maxSize}]`,
        422,
      );
    }

    if (team.status === 'SUBMITTING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đội đã có phiên chuẩn bị nộp hồ sơ đang diễn ra', 409);
    }

    if (team.status === 'SUBMITTED') {
      throw new DomainException(ErrorCode.ALREADY_APPLIED, 'Đội thi đã nộp hồ sơ thành công cho cuộc thi này', 409);
    }

    // SCHOL-20 requirement 1: Verify all members have active memberships & valid profiles
    for (const member of team.members) {
      const memRecord = await this.teamRepo.findActiveMembership(team.competitionId, member.studentId);
      if (!memRecord || memRecord.teamId !== team.id) {
        throw new DomainException(
          ErrorCode.STATE_CONFLICT,
          `Thành viên ${member.studentId} không còn tư cách thành viên hợp lệ trong đội`,
          409,
        );
      }

      if (this.identityClient) {
        const profileCheck = await this.identityClient.validateMemberProfile(member.studentId);
        if (!profileCheck.isValid) {
          throw new DomainException(
            ErrorCode.PROFILE_INCOMPLETE,
            `Hồ sơ của thành viên ${member.studentId} chưa hoàn thiện hoặc không còn hiệu lực (${profileCheck.message || 'Thiếu thông tin bắt buộc'})`,
            422,
          );
        }
      }
    }

    const reservationId = `res_${crypto.randomUUID()}`;
    const nextFencingToken = team.fencingToken + 1;
    const nextRosterVersion = team.rosterVersion + 1;

    // SCHOL-20 requirement 3: Conditional transition to SUBMITTING with optimistic concurrency lock
    const updatedTeam = await this.teamRepo.conditionalPrepareSubmission(
      team.id,
      leaderId,
      reservationId,
      team.version,
      nextFencingToken,
      nextRosterVersion,
    );

    if (!updatedTeam) {
      const latest = await this.teamRepo.findById(teamId);
      if (latest?.status === 'SUBMITTING') {
        throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đội đã có phiên chuẩn bị nộp hồ sơ đang diễn ra', 409);
      }
      if (latest?.status === 'SUBMITTED') {
        throw new DomainException(ErrorCode.ALREADY_APPLIED, 'Đội thi đã nộp hồ sơ thành công cho cuộc thi này', 409);
      }
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Xung đột khi chuẩn bị nộp hồ sơ, vui lòng thử lại', 409);
    }

    // 10 minutes lease for roster freeze
    const leaseExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const memberIds = updatedTeam.members.map((m) => m.studentId);

    const reservation = new SubmissionReservation(reservationId, {
      teamId: updatedTeam.id,
      competitionId: updatedTeam.competitionId,
      fencingToken: nextFencingToken,
      rosterVersion: nextRosterVersion,
      members: memberIds,
      leaseExpiresAt,
      status: 'PENDING',
      consents: [],
    });

    await this.teamRepo.saveReservation(reservation);
    this.logger.log(`[RosterFreeze] Đội ${updatedTeam.id} khóa nộp hồ sơ. Reservation: ${reservationId}, fencingToken: ${nextFencingToken}, rosterVersion: ${nextRosterVersion}`);

    return {
      reservationId: reservation.id,
      teamId: updatedTeam.id,
      competitionId: updatedTeam.competitionId,
      fencingToken: reservation.fencingToken,
      rosterVersion: reservation.rosterVersion,
      members: reservation.members,
      leaseExpiresAt: reservation.leaseExpiresAt.toISOString(),
      status: reservation.status,
    };
  }

  // SCHOL-20 requirement 4: Validate reservation with token and rosterVersion validation
  async validateReservation(teamId: string, fencingToken: number, expectedRosterVersion?: number) {
    const reservation = await this.teamRepo.findActiveReservationByTeam(teamId);
    if (!reservation) {
      return { isValid: false, status: 'NOT_FOUND', errorCode: 'RESERVATION_NOT_FOUND' };
    }
    if (reservation.fencingToken !== fencingToken) {
      return { isValid: false, status: 'STALE_FENCING_TOKEN', errorCode: 'FENCING_TOKEN_MISMATCH' };
    }
    if (reservation.isExpired()) {
      return { isValid: false, status: 'EXPIRED', errorCode: 'LEASE_EXPIRED' };
    }
    if (expectedRosterVersion !== undefined && reservation.rosterVersion !== expectedRosterVersion) {
      return { isValid: false, status: 'ROSTER_MISMATCH', errorCode: 'ROSTER_VERSION_MISMATCH' };
    }

    const team = await this.teamRepo.findById(teamId);
    if (!team || team.status !== 'SUBMITTING' || team.fencingToken !== fencingToken) {
      return { isValid: false, status: 'TEAM_STATE_INVALID', errorCode: 'TEAM_NOT_SUBMITTING' };
    }

    if (!reservation.hasAllConsents()) {
      return { isValid: false, status: 'MISSING_CONSENTS', errorCode: 'MISSING_MEMBER_CONSENTS' };
    }

    return { isValid: true, status: 'VALID', errorCode: '' };
  }

  // SCHOL-20 requirement 2: Consent collection bound to profileVersion and rosterVersion
  async submitTeamConsent(reservationId: string, studentId: string, dto: SubmitTeamConsentDto) {
    const reservation = await this.teamRepo.findReservationById(reservationId);
    if (!reservation) {
      throw DomainException.notFound('Phiên giữ chỗ nộp hồ sơ (Submission Reservation)');
    }

    if (reservation.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Phiên giữ chỗ không ở trạng thái chờ xác nhận', 409);
    }

    if (reservation.isExpired()) {
      throw new DomainException(ErrorCode.HOLD_EXPIRED, 'Thời hạn phiên giữ chỗ đã hết hạn (Lease Expired)', 409);
    }

    const team = await this.teamRepo.findById(reservation.teamId);
    if (!team || team.status !== 'SUBMITTING' || team.currentReservationId !== reservation.id) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đội thi không ở trạng thái chờ nộp hồ sơ cho phiên này', 409);
    }

    // Invalidate consent if team roster version has changed
    if (dto.rosterVersion !== reservation.rosterVersion || team.rosterVersion !== dto.rosterVersion) {
      throw new DomainException(
        ErrorCode.VERSION_MISMATCH,
        'Roster đã thay đổi, vui lòng xác nhận lại theo đội hình mới',
        409,
      );
    }

    reservation.addMemberConsent({
      studentId,
      consentId: `cst_${crypto.randomUUID()}`,
      snapshotId: dto.snapshotId,
      payloadHash: dto.payloadHash,
      profileVersion: dto.profileVersion,
      rosterVersion: dto.rosterVersion,
      confirmedAt: new Date(),
      previewId: dto.previewId,
      identityConsentId: dto.identityConsentId,
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

  /**
   * F37 (APP-05): current submission session of a team, for its members only. The leader uses
   * it to follow who has consented and to build the team Application; members to see their state.
   */
  async getActiveSubmission(teamId: string, viewerId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }
    if (!team.members.some((m) => m.studentId === viewerId)) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ thành viên của đội mới xem được phiên nộp hồ sơ', 403);
    }

    const reservation = await this.teamRepo.findActiveReservationByTeam(teamId);
    if (!reservation) {
      return { active: false, teamId: team.id, teamStatus: team.status, leaderId: team.leaderId };
    }

    return {
      active: true,
      teamId: team.id,
      teamStatus: team.status,
      leaderId: team.leaderId,
      reservationId: reservation.id,
      competitionId: reservation.competitionId,
      status: reservation.status,
      expired: reservation.isExpired(),
      leaseExpiresAt: reservation.leaseExpiresAt.toISOString(),
      fencingToken: reservation.fencingToken,
      rosterVersion: reservation.rosterVersion,
      members: [...reservation.members],
      hasAllConsents: reservation.hasAllConsents(),
      consents: reservation.consents.map((c) => ({
        studentId: c.studentId,
        previewId: c.previewId ?? '',
        identityConsentId: c.identityConsentId ?? '',
        snapshotId: c.snapshotId,
        profileVersion: c.profileVersion,
        payloadHash: c.payloadHash,
        confirmedAt: new Date(c.confirmedAt).toISOString(),
      })),
    };
  }

  /**
   * FR-PROF-05: a teammate's Passport with PUBLIC + TEAMMATES fields. Only Collaboration knows who
   * shares a team, so it checks both people are members before asking Identity for that audience.
   */
  async getTeammateProfile(teamId: string, viewerId: string, studentId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }
    const isMember = (id: string) => team.members.some((m) => m.studentId === id);
    const viewerIsMember = isMember(viewerId);
    if (!viewerIsMember) {
      throw new DomainException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Chỉ thành viên trong cùng đội mới xem được hồ sơ',
        403,
      );
    }

    let canView = isMember(studentId);
    // Leader is allowed to review profile/CV of candidates who applied to join this team (T4: Join request must be PENDING)
    if (!canView && team.leaderId === viewerId) {
      const requests = await this.teamRepo.findJoinRequestsByTeam(teamId);
      canView = requests.some((r) => r.applicantId === studentId && r.status === 'PENDING');
    }

    if (!canView) {
      throw new DomainException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Chỉ thành viên trong cùng đội hoặc ứng viên xin gia nhập mới có thể xem hồ sơ',
        403,
      );
    }
    if (!this.identityClient?.getProfileView) {
      throw new DomainException(ErrorCode.INTERNAL_ERROR, 'Không kết nối được Identity Service để lấy hồ sơ', 503);
    }
    return this.identityClient.getProfileView(studentId, 'TEAMMATES');
  }

  async submitTeamConsentByTeamId(teamId: string, studentId: string, dto: SubmitTeamConsentDto) {
    const reservation = await this.teamRepo.findActiveReservationByTeam(teamId);
    if (!reservation) {
      throw DomainException.notFound('Không tìm thấy phiên giữ chỗ nộp hồ sơ đang hoạt động cho đội');
    }
    return this.submitTeamConsent(reservation.id, studentId, dto);
  }

  // SCHOL-20 requirement 4: Confirm without holding DB transaction across network
  async confirmSubmission(reservationId: string, fencingToken?: number) {
    const reservation = await this.teamRepo.findReservationById(reservationId);
    if (!reservation) {
      throw DomainException.notFound('Phiên giữ chỗ nộp hồ sơ');
    }

    if (reservation.status === 'CONFIRMED') {
      const team = await this.teamRepo.findById(reservation.teamId);
      return {
        reservationId: reservation.id,
        status: reservation.status,
        teamStatus: team ? team.status : 'SUBMITTED',
      };
    }

    if (reservation.status === 'ABORTED') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Phiên giữ chỗ đã bị hủy trước đó', 409);
    }

    if (fencingToken !== undefined && reservation.fencingToken !== fencingToken) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Fencing token không khớp với phiên hiện tại', 409);
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

  async abortSubmission(reservationId: string, fencingToken?: number, reason?: string) {
    const reservation = await this.teamRepo.findReservationById(reservationId);
    if (!reservation) {
      throw DomainException.notFound('Phiên giữ chỗ nộp hồ sơ');
    }

    if (reservation.status === 'ABORTED') {
      const team = await this.teamRepo.findById(reservation.teamId);
      return {
        reservationId: reservation.id,
        status: reservation.status,
        teamStatus: team ? team.status : 'ACTIVE',
      };
    }

    if (reservation.status === 'CONFIRMED') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Phiên nộp đã được xác nhận, không thể hủy', 409);
    }

    if (fencingToken !== undefined && reservation.fencingToken !== fencingToken) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Fencing token không khớp với phiên hiện tại', 409);
    }

    reservation.abort();
    await this.teamRepo.updateReservation(reservation);

    const team = await this.teamRepo.findById(reservation.teamId);
    if (team) {
      team.abortSubmission(reservationId);
      await this.teamRepo.update(team);
    }

    this.logger.log(`[SubmissionAborted] Reservation ${reservationId} đã bị hủy (${reason || 'Manual abort'}), giải phóng Roster Freeze cho đội ${reservation.teamId}`);

    return {
      reservationId: reservation.id,
      status: reservation.status,
      teamStatus: team ? team.status : 'ACTIVE',
    };
  }

  async deleteTeam(teamId: string, studentId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.leaderId !== studentId) {
      throw DomainException.forbidden('Chỉ trưởng đội mới có quyền giải tán và xoá đội thi');
    }

    if (team.status === 'SUBMITTING' || team.status === 'SUBMITTED') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Không thể xoá đội thi đã hoặc đang trong tiến trình nộp hồ sơ',
      );
    }

    // Delete active memberships for all members in the team
    await this.teamRepo.deleteActiveMembershipsByTeam(teamId);

    // Delete all join requests related to this team
    await this.teamRepo.deleteJoinRequestsByTeam(teamId);

    // Delete team entity
    await this.teamRepo.delete(teamId);

    this.logger.log(`[TeamDeleted] Đội thi ${teamId} đã bị giải tán bởi Trưởng đội ${studentId}`);

    return {
      success: true,
      teamId,
      message: 'Đã giải tán và xoá đội thi thành công',
    };
  }

  async updateTeam(teamId: string, studentId: string, dto: UpdateTeamDto) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    if (team.leaderId !== studentId) {
      throw DomainException.forbidden('Chỉ trưởng đội mới có quyền chỉnh sửa thông tin đội thi');
    }

    if (team.status === 'SUBMITTING' || team.status === 'SUBMITTED') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Không thể chỉnh sửa thông tin đội thi đang hoặc đã nộp hồ sơ',
      );
    }

    team.updateInfo({
      name: dto.name,
      description: dto.description,
      minSize: dto.minSize,
      maxSize: dto.maxSize,
      avatarUrl: dto.avatarUrl,
      bannerImageUrl: dto.bannerImageUrl,
    });

    await this.teamRepo.update(team);

    this.logger.log(`[TeamUpdated] Đội thi ${teamId} đã được cập nhật bởi Trưởng đội ${studentId}`);

    return {
      ...team.props,
      id: team.id,
    };
  }
}
