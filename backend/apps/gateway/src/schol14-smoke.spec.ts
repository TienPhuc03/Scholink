import { OrganizationUseCase } from '../../identity-service/src/application/use-cases/organization.use-case';
import { IUserRepository, ActiveMembershipRecord } from '../../identity-service/src/domain/ports/user.repository.port';
import { User } from '../../identity-service/src/domain/user.entity';
import { ApplicationUseCase } from '../../opportunity-service/src/application/use-cases/application.use-case';
import { OpportunityUseCase } from '../../opportunity-service/src/application/use-cases/opportunity.use-case';
import { IApplicationRepository, SubmissionPreviewRecord, ApplicationRevisionRecord } from '../../opportunity-service/src/domain/ports/application.repository.port';
import { IOpportunityRepository, OpportunityFilter } from '../../opportunity-service/src/domain/ports/opportunity.repository.port';
import { Application } from '../../opportunity-service/src/domain/application.entity';
import { Opportunity } from '../../opportunity-service/src/domain/opportunity.entity';
import { TeamUseCase } from '../../collaboration-service/src/application/use-cases/team.use-case';
import { ChatUseCase } from '../../collaboration-service/src/application/use-cases/chat.use-case';
import { ReservationWorkerService } from '../../collaboration-service/src/infrastructure/workers/reservation-worker.service';
import { ITeamRepository } from '../../collaboration-service/src/domain/ports/team.repository.port';
import { IChatRepository, OutboxRecord } from '../../collaboration-service/src/domain/ports/chat.repository.port';
import { Team } from '../../collaboration-service/src/domain/team.entity';
import { JoinRequest } from '../../collaboration-service/src/domain/join-request.entity';
import { SubmissionReservation } from '../../collaboration-service/src/domain/reservation.entity';
import { ChatRoom, Message } from '../../collaboration-service/src/domain/chat.entity';
import { DomainException, ErrorCode, CryptoService, AuthenticatedUser } from '@shared';
import * as crypto from 'crypto';

// =========================================================================
// IN-MEMORY MOCK REPOSITORIES FOR SCHOL-14 INTEGRATION SMOKE TEST
// =========================================================================

class InMemoryUserRepository implements IUserRepository {
  public users = new Map<string, User>();
  public organizations = new Map<string, any>();
  public memberships = new Map<string, any>();
  public revokedSessions = new Set<string>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }
  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.props.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }
  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
  async update(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
  async saveSession(): Promise<void> {}
  async findSession(): Promise<any> { return null; }
  async revokeSession(sessionId: string): Promise<void> {
    this.revokedSessions.add(sessionId);
  }
  async revokeAllUserSessions(userId: string): Promise<void> {
    this.revokedSessions.add(`all_${userId}`);
  }
  async saveOtp(): Promise<void> {}
  async findLatestOtp(): Promise<any> { return null; }
  async markOtpUsed(): Promise<void> {}
  async incrementOtpAttempts(): Promise<void> {}

  // Organizations
  async createOrganization(org: any): Promise<void> {
    this.organizations.set(org.id, org);
  }
  async findOrganizationById(id: string): Promise<any> {
    return this.organizations.get(id) || null;
  }
  async listOrganizations(): Promise<any[]> {
    return Array.from(this.organizations.values());
  }
  async updateOrganization(id: string, updates: any): Promise<void> {
    const existing = this.organizations.get(id);
    if (existing) {
      this.organizations.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }
  async createMembership(membership: any): Promise<void> {
    const key = `${membership.organizationId}_${membership.userId}`;
    this.memberships.set(key, membership);
  }
  async findMembership(organizationId: string, userId: string): Promise<any> {
    return this.memberships.get(`${organizationId}_${userId}`) || null;
  }
  async findActiveMembershipByUser(userId: string): Promise<any> {
    for (const m of this.memberships.values()) {
      if (m.userId === userId && m.status === 'ACTIVE') return m;
    }
    return null;
  }
  async updateMembershipStatus(organizationId: string, userId: string, status: string): Promise<void> {
    const key = `${organizationId}_${userId}`;
    const m = this.memberships.get(key);
    if (m) {
      this.memberships.set(key, { ...m, status, updatedAt: new Date() });
    }
  }
  async listMembersByOrganization(organizationId: string): Promise<any[]> {
    const list: any[] = [];
    for (const m of this.memberships.values()) {
      if (m.organizationId === organizationId) list.push(m);
    }
    return list;
  }
}

class InMemoryOpportunityRepository implements IOpportunityRepository {
  public opportunities = new Map<string, Opportunity>();

  async findById(id: string): Promise<Opportunity | null> {
    return this.opportunities.get(id) || null;
  }
  async findMany(filter: OpportunityFilter): Promise<Opportunity[]> {
    let list = Array.from(this.opportunities.values());
    if (filter.organizationId) {
      list = list.filter((o) => o.props.organizationId === filter.organizationId);
    }
    if (filter.type) {
      list = list.filter((o) => o.type === filter.type);
    }
    return list;
  }
  async save(opportunity: Opportunity): Promise<void> {
    this.opportunities.set(opportunity.id, opportunity);
  }
  async update(opportunity: Opportunity): Promise<void> {
    this.opportunities.set(opportunity.id, opportunity);
  }
}

class InMemoryApplicationRepository implements IApplicationRepository {
  public applications = new Map<string, Application>();
  public previews = new Map<string, SubmissionPreviewRecord>();
  public revisions: ApplicationRevisionRecord[] = [];
  public events: any[] = [];
  public intents = new Map<string, any>();

  async findById(id: string): Promise<Application | null> {
    return this.applications.get(id) || null;
  }
  async findByOpportunityAndStudent(opportunityId: string, studentId: string): Promise<Application | null> {
    for (const app of this.applications.values()) {
      if (app.opportunityId === opportunityId && app.studentId === studentId) return app;
    }
    return null;
  }
  async findManyByStudent(studentId: string): Promise<Application[]> {
    return Array.from(this.applications.values()).filter((a) => a.studentId === studentId);
  }
  async findManyByOpportunity(opportunityId: string): Promise<Application[]> {
    return Array.from(this.applications.values()).filter((a) => a.opportunityId === opportunityId);
  }
  async findApplicationByTeamId(teamId: string): Promise<Application | null> {
    for (const app of this.applications.values()) {
      if (app.props.teamId === teamId) return app;
    }
    return null;
  }
  async save(application: Application): Promise<void> {
    this.applications.set(application.id, application);
  }
  async update(application: Application): Promise<void> {
    this.applications.set(application.id, application);
  }
  async savePreview(preview: SubmissionPreviewRecord): Promise<void> {
    this.previews.set(preview.previewId, preview);
  }
  async findPreviewById(previewId: string): Promise<SubmissionPreviewRecord | null> {
    return this.previews.get(previewId) || null;
  }
  async saveRevision(revision: ApplicationRevisionRecord): Promise<void> {
    this.revisions.push(revision);
  }
  async findLatestRevision(applicationId: string): Promise<ApplicationRevisionRecord | null> {
    const list = this.revisions.filter((r) => r.applicationId === applicationId);
    return list.length > 0 ? list[list.length - 1] : null;
  }
  async appendEvent(event: any): Promise<void> {
    this.events.push({ ...event, createdAt: new Date() });
  }
  async findEventsByApplication(applicationId: string): Promise<any[]> {
    return this.events.filter((e) => e.applicationId === applicationId);
  }
  async findSubmissionIntent(teamId: string, submissionId: string): Promise<{ status: string } | null> {
    const key = `${teamId}_${submissionId}`;
    return this.intents.get(key) || null;
  }
  async upsertSubmissionIntent(intent: any): Promise<void> {
    const key = `${intent.teamId}_${intent.submissionId}`;
    this.intents.set(key, { ...intent });
  }
}

class InMemoryTeamRepository implements ITeamRepository {
  public teams = new Map<string, Team>();
  public memberships = new Map<string, any>();
  public reservations = new Map<string, SubmissionReservation>();

  async findById(id: string): Promise<Team | null> {
    const t = this.teams.get(id);
    if (!t) return null;
    return new Team(t.id, { ...t.props, members: t.members.map((m) => ({ ...m })) });
  }
  async findByCompetitionAndStudent(competitionId: string, studentId: string): Promise<Team | null> {
    for (const t of this.teams.values()) {
      if (t.competitionId === competitionId && t.members.some((m) => m.studentId === studentId)) return t;
    }
    return null;
  }
  async findManyByCompetition(competitionId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter((t) => t.competitionId === competitionId);
  }
  async save(team: Team): Promise<void> { this.teams.set(team.id, team); }
  async update(team: Team): Promise<void> { this.teams.set(team.id, team); }
  async delete(id: string): Promise<void> { this.teams.delete(id); }
  async saveJoinRequest(): Promise<void> {}
  async findJoinRequestById(): Promise<any> { return null; }
  async findPendingRequest(): Promise<any> { return null; }
  async updateJoinRequest(): Promise<void> {}
  async findJoinRequestsByTeam(): Promise<any[]> { return []; }
  async findJoinRequestsByStudent(): Promise<any[]> { return []; }
  async saveReservation(res: SubmissionReservation): Promise<void> { this.reservations.set(res.id, res); }
  async findReservationById(id: string): Promise<SubmissionReservation | null> { return this.reservations.get(id) || null; }
  async findLatestReservationByTeam(teamId: string): Promise<SubmissionReservation | null> {
    const list = Array.from(this.reservations.values()).filter((r) => r.teamId === teamId);
    return list.length > 0 ? list[list.length - 1] : null;
  }
  async updateReservation(res: SubmissionReservation): Promise<void> { this.reservations.set(res.id, res); }
  async findExpiredSubmittingReservations(): Promise<SubmissionReservation[]> {
    const now = new Date();
    return Array.from(this.reservations.values()).filter(
      (r) => r.status === 'SUBMITTING' && r.leaseExpiresAt < now,
    );
  }
  async createActiveMembership(rec: any): Promise<void> {
    this.memberships.set(`${rec.competitionId}_${rec.studentId}`, rec);
  }
  async removeActiveMembership(competitionId: string, studentId: string): Promise<void> {
    this.memberships.delete(`${competitionId}_${studentId}`);
  }
  async findActiveMembership(competitionId: string, studentId: string): Promise<any> {
    return this.memberships.get(`${competitionId}_${studentId}`) || null;
  }
  async updateTeamStatusConditional(
    teamId: string,
    expectedStatus: string,
    newStatus: string,
    options?: { reservationId?: string; leaseExpiresAt?: Date; fencingToken?: number; expectedVersion?: number },
  ): Promise<boolean> {
    const t = this.teams.get(teamId);
    if (!t || t.status !== expectedStatus) return false;
    if (options?.expectedVersion !== undefined && t.version !== options.expectedVersion) return false;
    const updated = new Team(t.id, {
      ...t.props,
      status: newStatus as any,
      reservationId: options?.reservationId ?? t.props.reservationId,
      leaseExpiresAt: options?.leaseExpiresAt ?? t.props.leaseExpiresAt,
      fencingToken: options?.fencingToken ?? t.props.fencingToken,
      version: t.version + 1,
    });
    this.teams.set(teamId, updated);
    return true;
  }
}

class InMemoryChatRepository implements IChatRepository {
  public rooms = new Map<string, ChatRoom>();
  public messages = new Map<string, Message>();
  public outbox: OutboxRecord[] = [];
  public readCursors = new Map<string, number>();

  async findRoomById(id: string): Promise<ChatRoom | null> { return this.rooms.get(id) || null; }
  async findRoomByContext(contextType: string, contextId: string): Promise<ChatRoom | null> {
    for (const r of this.rooms.values()) {
      if (r.contextType === contextType && r.contextId === contextId) return r;
    }
    return null;
  }
  async saveRoom(room: ChatRoom): Promise<void> { this.rooms.set(room.id, room); }
  async updateRoom(room: ChatRoom): Promise<void> { this.rooms.set(room.id, room); }
  async findMessageByClientMsgId(roomId: string, senderId: string, clientMsgId: string): Promise<Message | null> {
    for (const m of this.messages.values()) {
      if (m.roomId === roomId && m.senderId === senderId && m.clientMsgId === clientMsgId) return m;
    }
    return null;
  }
  async saveMessageWithTransaction(message: Message, outboxPayload: any): Promise<void> {
    this.messages.set(message.id, message);
    this.outbox.push({
      id: `ob_${crypto.randomUUID()}`,
      aggregateType: 'CHAT_MESSAGE',
      aggregateId: message.roomId,
      eventType: 'ChatMessageCreated',
      payload: outboxPayload,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date(),
    });
  }
  async findMessagesByRoom(roomId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter((m) => m.roomId === roomId);
  }
  async updateReadCursor(roomId: string, userId: string, seq: number): Promise<number> {
    const key = `${roomId}_${userId}`;
    const curr = this.readCursors.get(key) || 0;
    const next = Math.max(curr, seq);
    this.readCursors.set(key, next);
    return next;
  }
  async getReadCursor(roomId: string, userId: string): Promise<number> {
    return this.readCursors.get(`${roomId}_${userId}`) || 0;
  }
  async getUnprocessedOutbox(): Promise<OutboxRecord[]> { return []; }
  async markOutboxProcessed(): Promise<void> {}
  async markOutboxFailed(): Promise<void> {}
}

// =========================================================================
// TEST SUITE: SCHOL-14 INTEGRATION SMOKE TEST
// =========================================================================

describe('SCHOL-14: Smoke Test Tích Hợp Hệ Thống & Bàn Giao', () => {
  const cryptoService = new CryptoService();

  // 1. Mock Actors (3 tài khoản + sinh viên)
  const adminActor: AuthenticatedUser = {
    userId: 'usr_admin_001',
    email: 'admin@scholink.edu.vn',
    role: 'ADMIN',
  };

  const organizerOrgA: AuthenticatedUser = {
    userId: 'usr_org_a_001',
    email: 'organizer.a@uit.edu.vn',
    role: 'ORGANIZER',
    organizationId: 'org_uit_cntt',
  };

  const organizerOrgB: AuthenticatedUser = {
    userId: 'usr_org_b_001',
    email: 'organizer.b@hcmus.edu.vn',
    role: 'ORGANIZER',
    organizationId: 'org_hcmus_khtn',
  };

  const studentActor: AuthenticatedUser = {
    userId: 'usr_student_001',
    email: 'student.uit@gmail.com',
    role: 'STUDENT',
  };

  // Repositories
  let userRepo: InMemoryUserRepository;
  let oppRepo: InMemoryOpportunityRepository;
  let appRepo: InMemoryApplicationRepository;
  let teamRepo: InMemoryTeamRepository;
  let chatRepo: InMemoryChatRepository;

  // Use cases
  let orgUseCase: OrganizationUseCase;
  let oppUseCase: OpportunityUseCase;
  let appUseCase: ApplicationUseCase;
  let teamUseCase: TeamUseCase;
  let chatUseCase: ChatUseCase;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    oppRepo = new InMemoryOpportunityRepository();
    appRepo = new InMemoryApplicationRepository();
    teamRepo = new InMemoryTeamRepository();
    chatRepo = new InMemoryChatRepository();

    orgUseCase = new OrganizationUseCase(userRepo);
    oppUseCase = new OpportunityUseCase(oppRepo);
    appUseCase = new ApplicationUseCase(appRepo, oppRepo, cryptoService);
    teamUseCase = new TeamUseCase(teamRepo, chatRepo, {} as any, {} as any);
    chatUseCase = new ChatUseCase(chatRepo);
  });

  // -----------------------------------------------------------------------
  // TEST 1: QUYỀN ĐƠN VỊ & ADMIN CẤP/THU QUYỀN MEMBERSHIP
  // -----------------------------------------------------------------------
  describe('1. API Organization & Membership Quyền Đơn Vị', () => {
    it('Admin tạo tổ chức và cấp quyền cho Organizer A và B thành công', async () => {
      // Admin tạo Org A
      const orgA = await orgUseCase.createOrganization({
        name: 'Đại học Công nghệ Thông tin - UIT',
        slug: 'uit-cntt',
        website: 'https://uit.edu.vn',
      });
      expect(orgA.id).toBeDefined();
      expect(orgA.status).toBe('ACTIVE');

      // Admin gán Organizer A vào Org A
      const memberA = await orgUseCase.assignOrganizer(orgA.id, adminActor.userId, {
        userId: organizerOrgA.userId,
        roleInOrg: 'COORDINATOR',
      });
      expect(memberA.status).toBe('ACTIVE');
      expect(memberA.organizationId).toBe(orgA.id);

      // Admin tạo Org B và gán Organizer B
      const orgB = await orgUseCase.createOrganization({
        name: 'Đại học Khoa học Tự nhiên - HCMUS',
        slug: 'hcmus-khtn',
      });
      const memberB = await orgUseCase.assignOrganizer(orgB.id, adminActor.userId, {
        userId: organizerOrgB.userId,
        roleInOrg: 'MANAGER',
      });
      expect(memberB.status).toBe('ACTIVE');
    });

    it('Admin thu hồi quyền Organizer và vô hiệu hóa phiên làm việc', async () => {
      const org = await orgUseCase.createOrganization({ name: 'FPT Software Academy' });
      await orgUseCase.assignOrganizer(org.id, adminActor.userId, {
        userId: 'usr_to_revoke',
        roleInOrg: 'COORDINATOR',
      });

      // Admin thu hồi quyền
      const revoked = await orgUseCase.revokeOrganizerMembership(org.id, adminActor.userId, {
        userId: 'usr_to_revoke',
        reason: 'Hết hạn hợp tác đơn vị',
      });

      expect(revoked.status).toBe('REVOKED');
      expect(userRepo.revokedSessions.has('all_usr_to_revoke')).toBe(true);

      // Kiểm tra thành viên đã bị thu hồi không còn active
      const membership = await userRepo.findActiveMembershipByUser('usr_to_revoke');
      expect(membership).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // TEST 2: KHOẢNG CÁCH DỮ LIỆU ĐƠN VỊ (TENANT ISOLATION & KANBAN)
  // -----------------------------------------------------------------------
  describe('2. Organizer Kanban Scoping & Optimistic Locking', () => {
    let oppOrgAId: string;
    let applicationId: string;

    beforeEach(async () => {
      // Organizer A tạo cuộc thi thuộc Org A
      const opp = await oppUseCase.create(
        {
          type: 'COMPETITION',
          title: 'UIT Hackathon 2026',
          description: 'Cuộc thi lập trình toàn quốc',
          organizerName: 'ĐH CNTT',
          applyMode: 'IN_APP',
          registerDeadline: new Date(Date.now() + 86400000).toISOString(),
          timezone: 'Asia/Ho_Chi_Minh',
        },
        organizerOrgA.userId,
        organizerOrgA.organizationId,
      );
      oppOrgAId = opp.id;

      // Sinh viên nộp hồ sơ vào cuộc thi của Org A
      const app = new Application('app_student_01', {
        opportunityId: oppOrgAId,
        studentId: studentActor.userId,
        submissionType: 'INDIVIDUAL',
        status: 'SUBMITTED',
        screening: 'ELIGIBLE',
        submittedAt: new Date(),
        revision: 1,
        version: 1,
      });
      await appRepo.save(app);
      applicationId = app.id;
    });

    it('Organizer A truy cập Kanban của Org A thành công', async () => {
      const kanban = await appUseCase.getOpportunityKanban(oppOrgAId, organizerOrgA);
      expect(kanban.opportunityId).toBe(oppOrgAId);
      expect(kanban.totalApplications).toBe(1);
      expect(kanban.columns.APPLIED.length).toBe(1);
    });

    it('Organizer B truy cập Kanban của Org A bị CHẶN 403 Forbidden', async () => {
      await expect(
        appUseCase.getOpportunityKanban(oppOrgAId, organizerOrgB),
      ).rejects.toThrow('Bạn không có quyền truy cập hồ sơ của đơn vị khác');
    });

    it('Organizer B cố gắng xem chi tiết hồ sơ của Org A bị CHẶN 403 Forbidden', async () => {
      await expect(
        appUseCase.getApplicationDetail(applicationId, organizerOrgB),
      ).rejects.toThrow('Bạn không có quyền xem chi tiết hồ sơ của đơn vị khác');
    });

    it('Organizer B cố gắng đổi trạng thái hồ sơ của Org A bị CHẶN 403 Forbidden', async () => {
      await expect(
        appUseCase.updateStatus(applicationId, organizerOrgB, { status: 'ACCEPTED' }),
      ).rejects.toThrow('Bạn không có quyền thay đổi trạng thái hồ sơ của đơn vị khác');
    });

    it('Chuyển trạng thái sang REJECTED bắt buộc phải có note/lý do', async () => {
      await expect(
        appUseCase.updateStatus(applicationId, organizerOrgA, { status: 'REJECTED', note: '' }),
      ).rejects.toThrow('Lý do từ chối (note) là bắt buộc khi chuyển trạng thái sang REJECTED');
    });

    it('Xung đột phiên bản optimistic locking (expectedVersion mismatch) bị từ chối 409', async () => {
      await expect(
        appUseCase.updateStatus(applicationId, organizerOrgA, {
          status: 'REVIEWING',
          expectedVersion: 99, // Phiên bản cũ / sai lệch
        }),
      ).rejects.toThrow(ErrorCode.VERSION_MISMATCH);
    });

    it('Organizer A chuyển trạng thái thành công kèm theo audit event', async () => {
      const res = await appUseCase.updateStatus(applicationId, organizerOrgA, {
        status: 'REVIEWING',
        expectedVersion: 1,
        note: 'Đang xem xét vòng loại 1',
      });

      expect(res.status).toBe('REVIEWING');
      expect(res.version).toBe(2);

      // Kiểm tra sự kiện kiểm toán đã được ghi
      const events = await appRepo.findEventsByApplication(applicationId);
      expect(events.length).toBe(1);
      expect(events[0].toStatus).toBe('REVIEWING');
      expect(events[0].actorId).toBe(organizerOrgA.userId);
      expect(events[0].reason).toBe('Đang xem xét vòng loại 1');
    });
  });

  // -----------------------------------------------------------------------
  // TEST 3: THU HỒI QUYỀN CHAT KHI RỜI ĐỘI
  // -----------------------------------------------------------------------
  describe('3. Chat Revocation khi Rời Đội', () => {
    it('Thành viên rời đội bị thu hồi quyền chat ngay lập tức', async () => {
      const leaderId = 'usr_leader_01';
      const memberId = 'usr_member_02';

      // 1. Tạo phòng chat đội
      const room = ChatRoom.createTeamRoom({
        id: 'room_team_001',
        teamId: 'team_001',
        competitionId: 'comp_001',
        name: 'Đội Vô Địch Hackathon',
        memberIds: [leaderId, memberId],
      });
      await chatRepo.saveRoom(room);

      // 2. Thành viên gửi tin nhắn khi còn trong đội -> Thành công
      const msg1 = await chatUseCase.sendMessage({
        roomId: room.id,
        senderId: memberId,
        content: 'Chào cả đội, mình vừa chuẩn bị tài liệu xong!',
        clientMsgId: 'msg_001',
      });
      expect(msg1.seq).toBe(1);

      // 3. Thành viên rời đội -> cập nhật phòng chat loại bỏ memberId
      const updatedRoom = room.removeMember(memberId);
      await chatRepo.updateRoom(updatedRoom);

      // 4. Thành viên đã rời đội cố gắng gửi tin nhắn -> BỊ CHẶN 403 Forbidden
      await expect(
        chatUseCase.sendMessage({
          roomId: room.id,
          senderId: memberId,
          content: 'Tin nhắn sau khi đã rời đội',
          clientMsgId: 'msg_002',
        }),
      ).rejects.toThrow('Bạn không phải là thành viên của phòng chat này');

      // 5. Thành viên đã rời đội cố gắng đọc lịch sử tin nhắn -> BỊ CHẶN 403 Forbidden
      await expect(
        chatUseCase.getMessages(room.id, memberId),
      ).rejects.toThrow('Bạn không có quyền truy cập phòng chat này');
    });
  });

  // -----------------------------------------------------------------------
  // TEST 4: NỘP ĐỘI CRASH & RECOVERY (TIMEOUT WORKER)
  // -----------------------------------------------------------------------
  describe('4. Nộp Đội Crash & Recovery (Worker Reconciliation)', () => {
    it('Worker timeout giải phóng khóa SUBMITTING khi nộp hồ sơ bị treo/crash', async () => {
      const leaderId = 'usr_leader_01';
      const teamId = 'team_crash_01';
      const competitionId = 'comp_hackathon_01';

      // Tạo đội
      const team = new Team(teamId, {
        competitionId,
        name: 'Đội AI Innovators',
        leaderId,
        members: [
          { studentId: leaderId, role: 'LEADER', joinedAt: new Date() },
          { studentId: 'usr_mem_02', role: 'MEMBER', joinedAt: new Date() },
        ],
        status: 'OPEN',
        version: 1,
      });
      await teamRepo.save(team);
      await teamRepo.createActiveMembership({ competitionId, studentId: leaderId, teamId });
      await teamRepo.createActiveMembership({ competitionId, studentId: 'usr_mem_02', teamId });

      // Đội PrepareSubmission -> Chuyển sang SUBMITTING với reservation lease
      const reservation = SubmissionReservation.create({
        id: 'res_crash_001',
        teamId,
        competitionId,
        leaderId,
        rosterVersion: 1,
        fencingToken: 1,
        requiredConsents: [
          { studentId: leaderId, status: 'CONSENTED', profileVersion: 1, snapshotId: 'snap_1', payloadHash: 'hash_1' },
          { studentId: 'usr_mem_02', status: 'CONSENTED', profileVersion: 1, snapshotId: 'snap_2', payloadHash: 'hash_2' },
        ],
        leaseDurationSeconds: 0, // Đã hết hạn ngay để mô phỏng timeout crash
      });
      await teamRepo.saveReservation(reservation);

      await teamRepo.updateTeamStatusConditional(teamId, 'OPEN', 'SUBMITTING', {
        reservationId: reservation.id,
        leaseExpiresAt: new Date(Date.now() - 1000), // Quá khứ
        fencingToken: 1,
      });

      const submittingTeam = await teamRepo.findById(teamId);
      expect(submittingTeam?.status).toBe('SUBMITTING');

      // Mô phỏng Opportunity Service xử lý abortIntent khi Worker gọi
      const abortOutcome = await appUseCase.abortSubmissionIntent({
        teamId,
        reservationId: reservation.id,
        fencingToken: 1,
        reason: 'Worker Lease Timeout',
      });

      expect(abortOutcome.outcome).toBe('ABORTED');

      // Worker tiến hành mở khóa an toàn cho đội trở về trạng thái OPEN
      const recovered = await teamRepo.updateTeamStatusConditional(teamId, 'SUBMITTING', 'OPEN');
      expect(recovered).toBe(true);

      const finalTeam = await teamRepo.findById(teamId);
      expect(finalTeam?.status).toBe('OPEN');
    });
  });
});
