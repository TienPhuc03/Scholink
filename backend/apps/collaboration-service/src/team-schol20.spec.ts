import { TeamUseCase } from './application/use-cases/team.use-case';
import { ReservationWorkerService } from './infrastructure/workers/reservation-worker.service';
import { ITeamRepository, ActiveMembershipRecord } from './domain/ports/team.repository.port';
import { IChatRepository, OutboxRecord } from './domain/ports/chat.repository.port';
import { IOpportunityClientPort, AbortIntentResult } from './domain/ports/opportunity-client.port';
import {
  IIdentityClientPort,
  MemberProfileValidationResult,
} from './domain/ports/identity-client.port';
import { Team } from './domain/team.entity';
import { JoinRequest } from './domain/join-request.entity';
import { SubmissionReservation } from './domain/reservation.entity';
import { ChatRoom, Message } from './domain/chat.entity';
import { DomainException, ErrorCode } from '@shared';
import * as crypto from 'crypto';

/**
 * SCHOL-20 In-Memory Team Repository simulating MongoDB Conditional Updates and Unique Constraints
 */
class InMemoryTeamRepository implements ITeamRepository {
  public teams = new Map<string, Team>();
  public memberships = new Map<string, ActiveMembershipRecord>(); // key: `${competitionId}_${studentId}`
  public joinRequests = new Map<string, JoinRequest>();
  public reservations = new Map<string, SubmissionReservation>();

  async findById(id: string): Promise<Team | null> {
    const t = this.teams.get(id);
    if (!t) return null;
    // Return a clone to simulate DB detachment
    return new Team(t.id, {
      ...t.props,
      members: t.members.map((m) => ({ ...m })),
      version: t.version,
    });
  }

  async findByCompetitionAndStudent(competitionId: string, studentId: string): Promise<Team | null> {
    for (const t of this.teams.values()) {
      if (t.competitionId === competitionId && t.members.some((m) => m.studentId === studentId)) {
        return this.findById(t.id);
      }
    }
    return null;
  }

  async findManyByCompetition(competitionId: string): Promise<Team[]> {
    const list: Team[] = [];
    for (const t of this.teams.values()) {
      if (t.competitionId === competitionId) list.push(t);
    }
    return list;
  }

  async save(team: Team): Promise<void> {
    this.teams.set(team.id, team);
  }

  async update(team: Team): Promise<void> {
    this.teams.set(team.id, team);
  }

  // Simulates MongoDB findOneAndUpdate with condition:
  // { id: teamId, leaderId: leaderId, status: { $in: ['FORMING', 'ACTIVE'] }, version: currentVersion }
  async conditionalPrepareSubmission(
    teamId: string,
    leaderId: string,
    reservationId: string,
    currentVersion: number,
    nextFencingToken: number,
    nextRosterVersion: number,
  ): Promise<Team | null> {
    const existing = this.teams.get(teamId);
    if (!existing) return null;

    if (
      existing.leaderId !== leaderId ||
      !['FORMING', 'ACTIVE'].includes(existing.status) ||
      existing.version !== currentVersion
    ) {
      return null;
    }

    const updated = new Team(existing.id, {
      ...existing.props,
      status: 'SUBMITTING',
      currentReservationId: reservationId,
      fencingToken: nextFencingToken,
      rosterVersion: nextRosterVersion,
      version: existing.version + 1,
    });

    this.teams.set(teamId, updated);
    return this.findById(teamId);
  }

  // Active Memberships (Enforces unique constraint: 1 student in 1 team per competition)
  async saveActiveMembership(record: ActiveMembershipRecord): Promise<void> {
    const key = `${record.competitionId}_${record.studentId}`;
    if (this.memberships.has(key)) {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        `Student ${record.studentId} already has an active membership in competition ${record.competitionId}`,
        409,
      );
    }
    this.memberships.set(key, record);
  }

  async findActiveMembership(competitionId: string, studentId: string): Promise<ActiveMembershipRecord | null> {
    const key = `${competitionId}_${studentId}`;
    return this.memberships.get(key) || null;
  }

  async deleteActiveMembership(competitionId: string, studentId: string): Promise<void> {
    const key = `${competitionId}_${studentId}`;
    this.memberships.delete(key);
  }

  // Join Requests
  async saveJoinRequest(request: JoinRequest): Promise<void> {
    this.joinRequests.set(request.id, request);
  }

  async findJoinRequestById(id: string): Promise<JoinRequest | null> {
    return this.joinRequests.get(id) || null;
  }

  async findPendingJoinRequest(teamId: string, applicantId: string): Promise<JoinRequest | null> {
    for (const req of this.joinRequests.values()) {
      if (req.teamId === teamId && req.applicantId === applicantId && req.status === 'PENDING') {
        return req;
      }
    }
    return null;
  }

  async findJoinRequestsByTeam(teamId: string): Promise<JoinRequest[]> {
    const list: JoinRequest[] = [];
    for (const req of this.joinRequests.values()) {
      if (req.teamId === teamId) list.push(req);
    }
    return list;
  }

  async updateJoinRequest(request: JoinRequest): Promise<void> {
    this.joinRequests.set(request.id, request);
  }

  // Submission Reservations
  async saveReservation(reservation: SubmissionReservation): Promise<void> {
    this.reservations.set(reservation.id, reservation);
  }

  async findReservationById(id: string): Promise<SubmissionReservation | null> {
    const r = this.reservations.get(id);
    if (!r) return null;
    return new SubmissionReservation(r.id, {
      ...r.props,
      consents: r.consents.map((c) => ({ ...c })),
    });
  }

  async findActiveReservationByTeam(teamId: string): Promise<SubmissionReservation | null> {
    for (const r of this.reservations.values()) {
      if (r.teamId === teamId && r.status === 'PENDING') {
        return this.findReservationById(r.id);
      }
    }
    return null;
  }

  async findExpiredPendingReservations(): Promise<SubmissionReservation[]> {
    const list: SubmissionReservation[] = [];
    const now = new Date();
    for (const r of this.reservations.values()) {
      if (r.status === 'PENDING' && r.leaseExpiresAt < now) {
        list.push(r);
      }
    }
    return list;
  }

  async updateReservation(reservation: SubmissionReservation): Promise<void> {
    this.reservations.set(reservation.id, reservation);
  }
}

/**
 * In-Memory Chat Repository to verify Chatroom participation & Revocation
 */
class InMemoryChatRepository implements IChatRepository {
  public rooms = new Map<string, ChatRoom>();

  async findRoomById(id: string): Promise<ChatRoom | null> {
    return this.rooms.get(id) || null;
  }

  async findRoomByRefId(refId: string): Promise<ChatRoom | null> {
    for (const r of this.rooms.values()) {
      if (r.refId === refId) return r;
    }
    return null;
  }

  async findRoomsByUser(userId: string): Promise<ChatRoom[]> {
    return Array.from(this.rooms.values()).filter((r) => r.participants.includes(userId));
  }

  async saveRoom(room: ChatRoom): Promise<void> {
    this.rooms.set(room.id, room);
  }

  async updateRoom(room: ChatRoom): Promise<void> {
    this.rooms.set(room.id, room);
  }

  async findMessageByClientMsgId(): Promise<Message | null> {
    return null;
  }

  async appendMessageWithSeqAndOutbox(): Promise<{ message: Message; outbox: OutboxRecord }> {
    throw new Error('Not needed for SCHOL-20');
  }

  async findMessagesByRoom(): Promise<Message[]> {
    return [];
  }

  async updateReadCursor(): Promise<number> {
    return 0;
  }

  async getReadCursor(): Promise<number> {
    return 0;
  }

  async findPendingOutboxEvents(): Promise<OutboxRecord[]> {
    return [];
  }

  async markOutboxPublished(): Promise<void> {}
  async markOutboxFailed(): Promise<void> {}
}

/**
 * Mock Opportunity Client to test Worker Timeout, Intent Reconciliation, and Network Disconnects
 */
class MockOpportunityClient implements IOpportunityClientPort {
  public nextOutcome: 'ABORTED' | 'COMMITTED' = 'ABORTED';
  public shouldSimulateNetworkError = false;
  public callCount = 0;
  public lastParams: any = null;

  async abortSubmissionIntent(params: {
    teamId: string;
    reservationId: string;
    fencingToken: number;
    reason?: string;
  }): Promise<AbortIntentResult> {
    this.callCount++;
    this.lastParams = params;

    if (this.shouldSimulateNetworkError) {
      throw new Error('gRPC connection timeout / UNAVAILABLE to Opportunity Service');
    }

    return {
      outcome: this.nextOutcome,
      message: `Intent processed with outcome: ${this.nextOutcome}`,
    };
  }
}

/**
 * Mock Identity Client to verify member passport profile validity
 */
class MockIdentityClient implements IIdentityClientPort {
  public invalidMembers = new Set<string>();

  async validateMemberProfile(studentId: string): Promise<MemberProfileValidationResult> {
    if (this.invalidMembers.has(studentId)) {
      return {
        isValid: false,
        completionScore: 60,
        missingFields: ['cvUrl', 'transcript'],
        message: 'Hồ sơ Passport chưa đạt 100% điểm hoặc thiếu tệp bắt buộc',
      };
    }
    return { isValid: true, completionScore: 100 };
  }
}

describe('SCHOL-20: Team Consent, Roster Freeze & Reservation Suite', () => {
  let teamRepo: InMemoryTeamRepository;
  let chatRepo: InMemoryChatRepository;
  let opportunityClient: MockOpportunityClient;
  let identityClient: MockIdentityClient;
  let teamUseCase: TeamUseCase;
  let reservationWorker: ReservationWorkerService;

  beforeEach(() => {
    teamRepo = new InMemoryTeamRepository();
    chatRepo = new InMemoryChatRepository();
    opportunityClient = new MockOpportunityClient();
    identityClient = new MockIdentityClient();
    teamUseCase = new TeamUseCase(teamRepo, chatRepo, identityClient);
    reservationWorker = new ReservationWorkerService(teamRepo, opportunityClient);
  });

  /**
   * Helper to set up an active team with 3 members
   */
  async function setupActiveTeam(teamId = 'team_1', compId = 'comp_1') {
    const leaderId = 'stu_leader';
    const member2 = 'stu_mem2';
    const member3 = 'stu_mem3';

    const team = new Team(teamId, {
      competitionId: compId,
      name: 'Scholink Dream Team',
      leaderId,
      minSize: 2,
      maxSize: 4,
      status: 'ACTIVE',
      rosterVersion: 1,
      fencingToken: 0,
      members: [
        { studentId: leaderId, role: 'LEADER', joinedAt: new Date() },
        { studentId: member2, role: 'MEMBER', joinedAt: new Date() },
        { studentId: member3, role: 'MEMBER', joinedAt: new Date() },
      ],
      version: 1,
    });
    await teamRepo.save(team);

    // Save active memberships
    await teamRepo.saveActiveMembership({
      id: 'mem_1',
      studentId: leaderId,
      competitionId: compId,
      teamId,
      role: 'LEADER',
      joinedAt: new Date(),
    });
    await teamRepo.saveActiveMembership({
      id: 'mem_2',
      studentId: member2,
      competitionId: compId,
      teamId,
      role: 'MEMBER',
      joinedAt: new Date(),
    });
    await teamRepo.saveActiveMembership({
      id: 'mem_3',
      studentId: member3,
      competitionId: compId,
      teamId,
      role: 'MEMBER',
      joinedAt: new Date(),
    });

    // Save chat room
    const chatRoom = new ChatRoom('room_team_1', {
      type: 'TEAM',
      refId: teamId,
      participants: [leaderId, member2, member3],
      lastSeq: 0,
    });
    await chatRepo.saveRoom(chatRoom);

    return { team, leaderId, member2, member3, compId };
  }

  // =========================================================================
  // 1. PrepareSubmission Verification (Owner, Min/Max, Active Membership, Version)
  // =========================================================================
  describe('1. PrepareSubmission Requirements', () => {
    it('phải từ chối nếu người gọi không phải trưởng đội (leaderId mismatch)', async () => {
      const { team, member2 } = await setupActiveTeam();
      await expect(teamUseCase.prepareSubmission(team.id, member2)).rejects.toThrow(
        DomainException,
      );
    });

    it('phải từ chối nếu số lượng thành viên nhỏ hơn minSize', async () => {
      const compId = 'comp_under';
      const teamId = 'team_under';
      const leaderId = 'stu_solo';

      const team = new Team(teamId, {
        competitionId: compId,
        name: 'Solo Team',
        leaderId,
        minSize: 2,
        maxSize: 4,
        status: 'FORMING',
        members: [{ studentId: leaderId, role: 'LEADER', joinedAt: new Date() }],
      });
      await teamRepo.save(team);
      await teamRepo.saveActiveMembership({
        id: 'mem_solo',
        studentId: leaderId,
        competitionId: compId,
        teamId,
        role: 'LEADER',
        joinedAt: new Date(),
      });

      await expect(teamUseCase.prepareSubmission(teamId, leaderId)).rejects.toThrow(
        'không đạt yêu cầu',
      );
    });

    it('phải từ chối nếu có thành viên mất tư cách active membership trong đội', async () => {
      const { team, leaderId, member3, compId } = await setupActiveTeam();

      // Giả lập member3 bị xóa membership trước đó
      await teamRepo.deleteActiveMembership(compId, member3);

      await expect(teamUseCase.prepareSubmission(team.id, leaderId)).rejects.toThrow(
        `Thành viên ${member3} không còn tư cách thành viên hợp lệ trong đội`,
      );
    });

    it('phải từ chối nếu có thành viên chưa hoàn thiện hồ sơ hoặc hồ sơ hết hạn (hồ sơ còn hiệu lực)', async () => {
      const { team, leaderId, member2 } = await setupActiveTeam();

      // Đánh dấu member2 hồ sơ chưa hợp lệ
      identityClient.invalidMembers.add(member2);

      await expect(teamUseCase.prepareSubmission(team.id, leaderId)).rejects.toThrow(
        `Hồ sơ của thành viên ${member2} chưa hoàn thiện hoặc không còn hiệu lực`,
      );
    });

    it('phải cấp reservation lease 10 phút, fencingToken tăng và rosterVersion tăng', async () => {
      const { team, leaderId } = await setupActiveTeam();

      const res = await teamUseCase.prepareSubmission(team.id, leaderId);

      expect(res.reservationId).toBeDefined();
      expect(res.fencingToken).toBe(1);
      expect(res.rosterVersion).toBe(2);
      expect(res.status).toBe('PENDING');
      expect(res.members).toHaveLength(3);

      // Verify lease is roughly 10 minutes in future
      const leaseExpiry = new Date(res.leaseExpiresAt).getTime();
      const tenMinutes = 10 * 60 * 1000;
      expect(leaseExpiry).toBeGreaterThan(Date.now() + tenMinutes - 5000);
      expect(leaseExpiry).toBeLessThanOrEqual(Date.now() + tenMinutes + 5000);

      // Verify team state transitioned to SUBMITTING
      const updatedTeam = await teamRepo.findById(team.id);
      expect(updatedTeam?.status).toBe('SUBMITTING');
      expect(updatedTeam?.currentReservationId).toBe(res.reservationId);
      expect(updatedTeam?.fencingToken).toBe(1);
      expect(updatedTeam?.rosterVersion).toBe(2);
    });
  });

  // =========================================================================
  // 2. Conditional State Transition & Concurrent Race Condition
  // =========================================================================
  describe('2. Conditional Transition & Race Prevention', () => {
    it('ngăn chặn 2 lời gọi prepareSubmission đồng thời bằng cập nhật có điều kiện', async () => {
      const { team, leaderId } = await setupActiveTeam();

      // Cả 2 gọi đồng thời
      const p1 = teamUseCase.prepareSubmission(team.id, leaderId);
      const p2 = teamUseCase.prepareSubmission(team.id, leaderId);

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Đúng 1 call thành công, call còn lại bị reject do conditional lock
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });

    it('từ chối prepareSubmission nếu đội đã ở trạng thái SUBMITTING hoặc SUBMITTED', async () => {
      const { team, leaderId } = await setupActiveTeam();
      await teamUseCase.prepareSubmission(team.id, leaderId);

      // Thử gọi lần 2 khi đã SUBMITTING
      await expect(teamUseCase.prepareSubmission(team.id, leaderId)).rejects.toThrow(
        'Đội đã có phiên chuẩn bị nộp hồ sơ đang diễn ra',
      );
    });
  });

  // =========================================================================
  // 3. Consent Collection bound to profileVersion, snapshotId & rosterVersion
  // =========================================================================
  describe('3. Consent Collection & Roster Binding', () => {
    it('cho phép từng member gửi consent hợp lệ gắn snapshotId, payloadHash, profileVersion và rosterVersion', async () => {
      const { team, leaderId, member2, member3 } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      // Leader nộp consent
      const c1 = await teamUseCase.submitTeamConsent(prep.reservationId, leaderId, {
        snapshotId: 'snap_leader',
        payloadHash: 'a'.repeat(64),
        profileVersion: 1,
        rosterVersion: prep.rosterVersion,
      });
      expect(c1.consentsCount).toBe(1);
      expect(c1.hasAllConsents).toBe(false);

      // Member 2 nộp consent
      const c2 = await teamUseCase.submitTeamConsent(prep.reservationId, member2, {
        snapshotId: 'snap_mem2',
        payloadHash: 'b'.repeat(64),
        profileVersion: 2,
        rosterVersion: prep.rosterVersion,
      });
      expect(c2.consentsCount).toBe(2);
      expect(c2.hasAllConsents).toBe(false);

      // Member 3 nộp consent qua submitTeamConsentByTeamId -> đủ 100% consent!
      const c3 = await teamUseCase.submitTeamConsentByTeamId(team.id, member3, {
        snapshotId: 'snap_mem3',
        payloadHash: 'c'.repeat(64),
        profileVersion: 1,
        rosterVersion: prep.rosterVersion,
      });
      expect(c3.consentsCount).toBe(3);
      expect(c3.hasAllConsents).toBe(true);
    });

    it('từ chối consent nếu member không thuộc danh sách đăng ký của đội', async () => {
      const { team, leaderId } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      await expect(
        teamUseCase.submitTeamConsent(prep.reservationId, 'stu_imposter', {
          snapshotId: 'snap_hacker',
          payloadHash: 'x'.repeat(64),
          profileVersion: 1,
          rosterVersion: prep.rosterVersion,
        }),
      ).rejects.toThrow('Thành viên không thuộc danh sách đăng ký của đội');
    });

    it('từ chối consent nếu rosterVersion không khớp với phiên hiện tại (Roster Invalidation)', async () => {
      const { team, leaderId } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      // Member nộp với stale rosterVersion (ví dụ rosterVersion cũ = 1 trong khi prep đã lên 2)
      await expect(
        teamUseCase.submitTeamConsent(prep.reservationId, leaderId, {
          snapshotId: 'snap_stale',
          payloadHash: 'a'.repeat(64),
          profileVersion: 1,
          rosterVersion: 1, // Mismatch!
        }),
      ).rejects.toThrow('Roster đã thay đổi, vui lòng xác nhận lại theo đội hình mới');
    });
  });

  // =========================================================================
  // 4. Roster Freeze & Membership Invalidation on Change
  // =========================================================================
  describe('4. Roster Freeze & Chat Revocation', () => {
    it('chặn leaveTeam và transferLeader khi đội đang SUBMITTING (Roster Freeze)', async () => {
      const { team, leaderId, member2 } = await setupActiveTeam();
      await teamUseCase.prepareSubmission(team.id, leaderId);

      // Roster Freeze: member không được rời
      await expect(teamUseCase.leaveTeam(team.id, member2)).rejects.toThrow(
        'Không thể rời hoặc xóa thành viên khi đội đang nộp hồ sơ (Roster Freeze)',
      );

      // Roster Freeze: leader không được chuyển quyền
      await expect(
        teamUseCase.transferLeader(team.id, leaderId, { newLeaderId: member2 }),
      ).rejects.toThrow(
        'Không thể chuyển quyền trưởng đội khi đang nộp hồ sơ (Roster Freeze)',
      );
    });

    it('khi rời đội ở trạng thái ACTIVE: xóa membership, thu hồi quyền chat ngay lập tức và tăng rosterVersion', async () => {
      const { team, member2, compId } = await setupActiveTeam();

      // Kiểm tra chat room ban đầu có member2
      const roomBefore = await chatRepo.findRoomByRefId(team.id);
      expect(roomBefore?.participants).toContain(member2);

      // Member 2 rời đội
      const leaveRes = await teamUseCase.leaveTeam(team.id, member2);
      expect(leaveRes.members.some((m) => m.studentId === member2)).toBe(false);

      // Membership bị xóa
      const mem = await teamRepo.findActiveMembership(compId, member2);
      expect(mem).toBeNull();

      // Chat room thu hồi quyền ngay lập tức
      const roomAfter = await chatRepo.findRoomByRefId(team.id);
      expect(roomAfter?.participants).not.toContain(member2);

      // RosterVersion tăng
      const updatedTeam = await teamRepo.findById(team.id);
      expect(updatedTeam?.rosterVersion).toBe(2);
    });
  });

  // =========================================================================
  // 5. ValidateReservation & Confirm/Abort Acceptance
  // =========================================================================
  describe('5. ValidateReservation & Token Verification', () => {
    it('validateReservation từ chối token cũ (STALE_FENCING_TOKEN)', async () => {
      const { team, leaderId } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      const check = await teamUseCase.validateReservation(team.id, prep.fencingToken - 1);
      expect(check.isValid).toBe(false);
      expect(check.status).toBe('STALE_FENCING_TOKEN');
    });

    it('validateReservation từ chối nếu chưa đủ 100% consent của các thành viên', async () => {
      const { team, leaderId } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      // Mới chỉ có leader nộp
      await teamUseCase.submitTeamConsent(prep.reservationId, leaderId, {
        snapshotId: 'snap_lead',
        payloadHash: 'a'.repeat(64),
        profileVersion: 1,
        rosterVersion: prep.rosterVersion,
      });

      const check = await teamUseCase.validateReservation(team.id, prep.fencingToken, prep.rosterVersion);
      expect(check.isValid).toBe(false);
      expect(check.status).toBe('MISSING_CONSENTS');
    });

    it('validateReservation chấp nhận khi token, rosterVersion và mọi consents đều hợp lệ', async () => {
      const { team, leaderId, member2, member3 } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      // Nộp đủ cả 3 consents
      for (const m of [leaderId, member2, member3]) {
        await teamUseCase.submitTeamConsent(prep.reservationId, m, {
          snapshotId: `snap_${m}`,
          payloadHash: 'x'.repeat(64),
          profileVersion: 1,
          rosterVersion: prep.rosterVersion,
        });
      }

      const check = await teamUseCase.validateReservation(team.id, prep.fencingToken, prep.rosterVersion);
      expect(check.isValid).toBe(true);
      expect(check.status).toBe('VALID');
    });

    it('confirmSubmission thành công chuyển reservation thành CONFIRMED và team thành SUBMITTED', async () => {
      const { team, leaderId, member2, member3 } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      for (const m of [leaderId, member2, member3]) {
        await teamUseCase.submitTeamConsent(prep.reservationId, m, {
          snapshotId: `snap_${m}`,
          payloadHash: 'x'.repeat(64),
          profileVersion: 1,
          rosterVersion: prep.rosterVersion,
        });
      }

      const confirmRes = await teamUseCase.confirmSubmission(prep.reservationId, prep.fencingToken);
      expect(confirmRes.status).toBe('CONFIRMED');
      expect(confirmRes.teamStatus).toBe('SUBMITTED');

      const updatedTeam = await teamRepo.findById(team.id);
      expect(updatedTeam?.status).toBe('SUBMITTED');

      // Idempotency: gọi confirm lại vẫn trả về thành công an toàn
      const reConfirm = await teamUseCase.confirmSubmission(prep.reservationId, prep.fencingToken);
      expect(reConfirm.status).toBe('CONFIRMED');
    });

    it('từ chối confirmSubmission sau khi đã abortSubmission (xung đột trạng thái)', async () => {
      const { team, leaderId } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      await teamUseCase.abortSubmission(prep.reservationId, prep.fencingToken);

      await expect(
        teamUseCase.confirmSubmission(prep.reservationId, prep.fencingToken),
      ).rejects.toThrow('Phiên giữ chỗ đã bị hủy trước đó');
    });
  });

  // =========================================================================
  // 6. Worker Timeout & Opportunity AbortSubmissionIntent (SCHOL-20 Req 5)
  // =========================================================================
  describe('6. Worker Timeout & Opportunity Reconcile', () => {
    it('khi lease hết hạn và Opportunity trả ABORTED -> worker mở khóa đội về ACTIVE', async () => {
      const { team, leaderId } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      // Giả lập lease hết hạn (lùi thời gian về quá khứ)
      const res = await teamRepo.findReservationById(prep.reservationId);
      (res as any)._props.leaseExpiresAt = new Date(Date.now() - 1000);
      await teamRepo.updateReservation(res!);

      opportunityClient.nextOutcome = 'ABORTED';

      const processed = await reservationWorker.cleanupExpiredReservations();
      expect(processed).toBe(1);
      expect(opportunityClient.callCount).toBe(1);
      expect(opportunityClient.lastParams.teamId).toBe(team.id);

      // Verify reservation is ABORTED and team unlocked back to ACTIVE
      const updatedRes = await teamRepo.findReservationById(prep.reservationId);
      expect(updatedRes?.status).toBe('ABORTED');

      const updatedTeam = await teamRepo.findById(team.id);
      expect(updatedTeam?.status).toBe('ACTIVE');
      expect(updatedTeam?.currentReservationId).toBeUndefined();
      expect(updatedTeam?.rosterVersion).toBe(3); // rosterVersion increments on abort
    });

    it('khi lease hết hạn nhưng Opportunity trả COMMITTED -> worker reconcile xác nhận đội SUBMITTED', async () => {
      const { team, leaderId, member2, member3 } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      // Giả lập đã đủ consent và lease hết hạn
      for (const m of [leaderId, member2, member3]) {
        await teamUseCase.submitTeamConsent(prep.reservationId, m, {
          snapshotId: `snap_${m}`,
          payloadHash: 'x'.repeat(64),
          profileVersion: 1,
          rosterVersion: prep.rosterVersion,
        });
      }

      const res = await teamRepo.findReservationById(prep.reservationId);
      (res as any)._props.leaseExpiresAt = new Date(Date.now() - 1000);
      await teamRepo.updateReservation(res!);

      // Opportunity báo Application đã được COMMITTED thành công trước đó
      opportunityClient.nextOutcome = 'COMMITTED';

      const processed = await reservationWorker.cleanupExpiredReservations();
      expect(processed).toBe(1);

      // Worker reconcile: reservation CONFIRMED, team SUBMITTED!
      const updatedRes = await teamRepo.findReservationById(prep.reservationId);
      expect(updatedRes?.status).toBe('CONFIRMED');

      const updatedTeam = await teamRepo.findById(team.id);
      expect(updatedTeam?.status).toBe('SUBMITTED');
    });

    it('khi mất kết nối tới Opportunity Service (network error) -> worker GIỮ KHÓA RETRY, không mở khóa', async () => {
      const { team, leaderId } = await setupActiveTeam();
      const prep = await teamUseCase.prepareSubmission(team.id, leaderId);

      // Giả lập lease hết hạn
      const res = await teamRepo.findReservationById(prep.reservationId);
      (res as any)._props.leaseExpiresAt = new Date(Date.now() - 1000);
      await teamRepo.updateReservation(res!);

      // Lỗi mạng tới Opportunity Service
      opportunityClient.shouldSimulateNetworkError = true;

      const processed = await reservationWorker.cleanupExpiredReservations();
      expect(processed).toBe(0); // Không xử lý hoàn tất được do lỗi mạng

      // SCHOL-20 requirement 5: "mất kết nối giữ khóa retry" -> team vẫn SUBMITTING, reservation vẫn PENDING!
      const keptRes = await teamRepo.findReservationById(prep.reservationId);
      expect(keptRes?.status).toBe('PENDING');

      const keptTeam = await teamRepo.findById(team.id);
      expect(keptTeam?.status).toBe('SUBMITTING');
      expect(keptTeam?.currentReservationId).toBe(prep.reservationId);
    });
  });

  // =========================================================================
  // 7. Multi-Team Membership & Reopen from Withdrawal
  // =========================================================================
  describe('7. Multi-team Membership Constraint & Reopen', () => {
    it('ngăn chặn 1 sinh viên tham gia 2 đội trong cùng một cuộc thi', async () => {
      const { compId, member2 } = await setupActiveTeam('team_alpha', 'comp_shared');

      // member2 đã ở team_alpha trong comp_shared. Cố tình tạo đội mới trong comp_shared:
      await expect(
        teamUseCase.createTeam(member2, {
          competitionId: compId,
          name: 'Cheating Team',
          minSize: 2,
          maxSize: 4,
        }),
      ).rejects.toThrow('Bạn đã tham gia một đội thi trong cuộc thi này');
    });

    it('cho phép mở lại đội từ hồ sơ đã rút (reopenFromWithdrawal)', async () => {
      const { team, leaderId } = await setupActiveTeam();

      // Giả lập đội đã SUBMITTED
      (team as any)._props.status = 'SUBMITTED';
      await teamRepo.update(team);

      // Leader mở lại đội sau khi rút hồ sơ
      const reopenRes = await teamUseCase.reopenTeamFromWithdrawal(team.id, leaderId);
      expect(reopenRes.status).toBe('ACTIVE');

      const reloaded = await teamRepo.findById(team.id);
      expect(reloaded?.status).toBe('ACTIVE');
      expect(reloaded?.rosterVersion).toBe(2);
    });
  });
});
