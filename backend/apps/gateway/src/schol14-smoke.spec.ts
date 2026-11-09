import { OrganizationUseCase } from '../../identity-service/src/application/use-cases/organization.use-case';
import { IUserRepository, SessionRecord } from '../../identity-service/src/domain/ports/user.repository.port';
import { User } from '../../identity-service/src/domain/user.entity';
import { ApplicationUseCase } from '../../opportunity-service/src/application/use-cases/application.use-case';
import { OpportunityUseCase } from '../../opportunity-service/src/application/use-cases/opportunity.use-case';
import { IApplicationRepository, SubmissionPreviewRecord, ApplicationRevisionRecord } from '../../opportunity-service/src/domain/ports/application.repository.port';
import { IOpportunityRepository, OpportunityFilter } from '../../opportunity-service/src/domain/ports/opportunity.repository.port';
import { Application } from '../../opportunity-service/src/domain/application.entity';
import { Opportunity } from '../../opportunity-service/src/domain/opportunity.entity';
import { TeamUseCase } from '../../collaboration-service/src/application/use-cases/team.use-case';
import { ChatUseCase } from '../../collaboration-service/src/application/use-cases/chat.use-case';
import { ITeamRepository, ActiveMembershipRecord } from '../../collaboration-service/src/domain/ports/team.repository.port';
import { IChatRepository, OutboxRecord } from '../../collaboration-service/src/domain/ports/chat.repository.port';
import { Team } from '../../collaboration-service/src/domain/team.entity';
import { JoinRequest } from '../../collaboration-service/src/domain/join-request.entity';
import { SubmissionReservation } from '../../collaboration-service/src/domain/reservation.entity';
import { ChatRoom, Message } from '../../collaboration-service/src/domain/chat.entity';
import { DomainException, ErrorCode, CryptoService, AuthenticatedUser, OtpPurpose } from '@shared';
import * as crypto from 'crypto';

// =========================================================================
// IN-MEMORY MOCK REPOSITORIES FOR SCHOL-14 INTEGRATION SMOKE TEST
// =========================================================================

class InMemoryUserRepository implements IUserRepository {
  public users = new Map<string, User>();
  public sessions = new Map<string, SessionRecord>();
  public revokedSessions = new Set<string>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }
  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }
  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
  async update(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
  async saveSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }
  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const s of this.sessions.values()) {
      if (s.tokenHash === tokenHash) return s;
    }
    return null;
  }
  async markSessionUsed(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      this.sessions.set(sessionId, { ...s, isUsed: true });
    }
  }
  async revokeSessionFamily(familyId: string, reason: string): Promise<void> {
    this.revokedSessions.add(familyId);
  }
  async revokeAllUserSessions(userId: string, reason?: string): Promise<void> {
    this.revokedSessions.add(`all_${userId}`);
  }
  async findOtpRecord(normalizedEmail: string, purpose: OtpPurpose): Promise<any> {
    return null;
  }
  async saveOtpRecord(record: any): Promise<void> {}
  async deleteOtpRecord(normalizedEmail: string, purpose: OtpPurpose): Promise<void> {}
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
  public memberships = new Map<string, ActiveMembershipRecord>();
  public reservations = new Map<string, SubmissionReservation>();
  public joinRequests = new Map<string, JoinRequest>();

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
  async save(team: Team): Promise<void> {
    this.teams.set(team.id, team);
  }
  async update(team: Team): Promise<void> {
    this.teams.set(team.id, team);
  }
  async conditionalPrepareSubmission(
    teamId: string,
    leaderId: string,
    reservationId: string,
    currentVersion: number,
    nextFencingToken: number,
    nextRosterVersion: number,
  ): Promise<Team | null> {
    const t = this.teams.get(teamId);
    if (!t || t.version !== currentVersion || t.leaderId !== leaderId) return null;
    const updated = new Team(t.id, {
      ...t.props,
      status: 'SUBMITTING',
      currentReservationId: reservationId,
      fencingToken: nextFencingToken,
      rosterVersion: nextRosterVersion,
      version: t.version + 1,
    });
    this.teams.set(teamId, updated);
    return updated;
  }
  async saveActiveMembership(record: ActiveMembershipRecord): Promise<void> {
    this.memberships.set(`${record.competitionId}_${record.studentId}`, record);
  }
  async findActiveMembership(competitionId: string, studentId: string): Promise<ActiveMembershipRecord | null> {
    return this.memberships.get(`${competitionId}_${studentId}`) || null;
  }
  async deleteActiveMembership(competitionId: string, studentId: string): Promise<void> {
    this.memberships.delete(`${competitionId}_${studentId}`);
  }
  async saveJoinRequest(request: JoinRequest): Promise<void> {
    this.joinRequests.set(request.id, request);
  }
  async findJoinRequestById(id: string): Promise<JoinRequest | null> {
    return this.joinRequests.get(id) || null;
  }
  async findPendingJoinRequest(teamId: string, applicantId: string): Promise<JoinRequest | null> {
    for (const req of this.joinRequests.values()) {
      if (req.props.teamId === teamId && req.props.applicantId === applicantId && req.props.status === 'PENDING') {
        return req;
      }
    }
    return null;
  }
  async findJoinRequestsByTeam(teamId: string): Promise<JoinRequest[]> {
    return Array.from(this.joinRequests.values()).filter((r) => r.props.teamId === teamId);
  }
  async updateJoinRequest(request: JoinRequest): Promise<void> {
    this.joinRequests.set(request.id, request);
  }
  async saveReservation(res: SubmissionReservation): Promise<void> {
    this.reservations.set(res.id, res);
  }
  async findReservationById(id: string): Promise<SubmissionReservation | null> {
    return this.reservations.get(id) || null;
  }
  async findActiveReservationByTeam(teamId: string): Promise<SubmissionReservation | null> {
    for (const res of this.reservations.values()) {
      if (res.teamId === teamId && res.props.status === 'PENDING') return res;
    }
    return null;
  }
  async findExpiredPendingReservations(): Promise<SubmissionReservation[]> {
    const now = new Date();
    return Array.from(this.reservations.values()).filter(
      (r) => r.props.status === 'PENDING' && r.leaseExpiresAt < now,
    );
  }
  async updateReservation(res: SubmissionReservation): Promise<void> {
    this.reservations.set(res.id, res);
  }
}

class InMemoryChatRepository implements IChatRepository {
  public rooms = new Map<string, ChatRoom>();
  public messages = new Map<string, Message>();
  public outbox: OutboxRecord[] = [];
  public readCursors = new Map<string, number>();

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
  async findMessageByClientMsgId(roomId: string, senderId: string, clientMsgId: string): Promise<Message | null> {
    for (const m of this.messages.values()) {
      if (m.roomId === roomId && m.senderId === senderId && m.clientMsgId === clientMsgId) return m;
    }
    return null;
  }
  async findMessagesByRoom(roomId: string, afterSeq?: number, limit?: number): Promise<Message[]> {
    let list = Array.from(this.messages.values()).filter((m) => m.roomId === roomId);
    if (afterSeq !== undefined) {
      list = list.filter((m) => m.seq > afterSeq);
    }
    if (limit) {
      list = list.slice(0, limit);
    }
    return list;
  }
  async saveMessageWithOutboxInTransaction(
    roomId: string,
    senderId: string,
    content: string,
    clientMsgId?: string,
    assetId?: string,
    outboxPayload?: any,
  ): Promise<{ message: Message; isDuplicate: boolean }> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }
    if (clientMsgId) {
      const existing = await this.findMessageByClientMsgId(roomId, senderId, clientMsgId);
      if (existing) {
        return { message: existing, isDuplicate: true };
      }
    }
    const nextSeq = room.nextSeq();
    room.updateLastMessage(content.slice(0, 100));
    const msgId = `msg_${crypto.randomUUID()}`;
    const message = new Message(msgId, {
      roomId,
      senderId,
      seq: nextSeq,
      clientMsgId,
      content,
      assetId,
      readBy: [senderId],
      createdAt: new Date(),
    });
    this.messages.set(msgId, message);
    if (outboxPayload) {
      this.outbox.push({
        id: `ob_${crypto.randomUUID()}`,
        aggregateType: 'CHAT_MESSAGE',
        aggregateId: roomId,
        eventType: 'ChatMessageCreated',
        payload: outboxPayload,
        status: 'PENDING',
        retryCount: 0,
        createdAt: new Date(),
      });
    }
    return { message, isDuplicate: false };
  }
  async updateReadReceipt(roomId: string, userId: string, lastReadSeq: number): Promise<void> {
    const key = `${roomId}_${userId}`;
    const curr = this.readCursors.get(key) || 0;
    this.readCursors.set(key, Math.max(curr, lastReadSeq));
  }
  async getReadReceipt(roomId: string, userId: string): Promise<number> {
    return this.readCursors.get(`${roomId}_${userId}`) || 0;
  }
  async findPendingOutboxEvents(limit?: number): Promise<OutboxRecord[]> {
    return this.outbox.filter((o) => o.status === 'PENDING').slice(0, limit || 50);
  }
  async markOutboxPublished(id: string): Promise<void> {
    const item = this.outbox.find((o) => o.id === id);
    if (item) item.status = 'PUBLISHED';
  }
  async markOutboxFailed(id: string, error: string, nextRetryAt: Date, retryCount: number): Promise<void> {
    const item = this.outbox.find((o) => o.id === id);
    if (item) {
      item.status = 'FAILED';
      item.error = error;
      item.nextRetryAt = nextRetryAt;
      item.retryCount = retryCount;
    }
  }
}

function createMockMongooseModel(storage: Map<string, any>) {
  return {
    findOne: (query: any) => ({
      exec: async () => {
        for (const doc of storage.values()) {
          const match = Object.keys(query).every((k) => doc[k] === query[k]);
          if (match) {
            return {
              ...doc,
              save: async function () {
                storage.set(this.id || `${this.organizationId}_${this.userId}`, this);
                return this;
              },
            };
          }
        }
        return null;
      },
    }),
    find: (query?: any) => ({
      sort: () => ({
        exec: async () => Array.from(storage.values()),
      }),
      exec: async () => {
        if (!query || Object.keys(query).length === 0) return Array.from(storage.values());
        return Array.from(storage.values()).filter((doc) =>
          Object.keys(query).every((k) => doc[k] === query[k]),
        );
      },
    }),
    create: async (doc: any) => {
      const savedDoc = {
        ...doc,
        save: async function () {
          storage.set(this.id || `${this.organizationId}_${this.userId}`, this);
          return this;
        },
      };
      storage.set(doc.id || `${doc.organizationId}_${doc.userId}`, savedDoc);
      return savedDoc;
    },
  } as any;
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

  // Repositories & storage
  let userRepo: InMemoryUserRepository;
  let oppRepo: InMemoryOpportunityRepository;
  let appRepo: InMemoryApplicationRepository;
  let teamRepo: InMemoryTeamRepository;
  let chatRepo: InMemoryChatRepository;
  let orgStorage: Map<string, any>;
  let membershipStorage: Map<string, any>;
  let orgModel: any;
  let membershipModel: any;

  // Use cases
  let orgUseCase: OrganizationUseCase;
  let oppUseCase: OpportunityUseCase;
  let appUseCase: ApplicationUseCase;
  let teamUseCase: TeamUseCase;
  let chatUseCase: ChatUseCase;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    oppRepo = new InMemoryOpportunityRepository();
    appRepo = new InMemoryApplicationRepository();
    teamRepo = new InMemoryTeamRepository();
    chatRepo = new InMemoryChatRepository();
    orgStorage = new Map<string, any>();
    membershipStorage = new Map<string, any>();

    orgModel = createMockMongooseModel(orgStorage);
    membershipModel = createMockMongooseModel(membershipStorage);

    // Seed mock users
    await userRepo.save(new User(adminActor.userId, {
      email: adminActor.email,
      fullName: 'System Admin',
      passwordHash: 'hash_pass',
      role: 'ADMIN',
      status: 'ACTIVE',
    }));
    await userRepo.save(new User(organizerOrgA.userId, {
      email: organizerOrgA.email,
      fullName: 'Organizer A',
      passwordHash: 'hash_pass',
      role: 'ORGANIZER',
      status: 'ACTIVE',
    }));
    await userRepo.save(new User(organizerOrgB.userId, {
      email: organizerOrgB.email,
      fullName: 'Organizer B',
      passwordHash: 'hash_pass',
      role: 'ORGANIZER',
      status: 'ACTIVE',
    }));
    await userRepo.save(new User(studentActor.userId, {
      email: studentActor.email,
      fullName: 'Student UIT',
      passwordHash: 'hash_pass',
      role: 'STUDENT',
      status: 'ACTIVE',
    }));
    await userRepo.save(new User('usr_to_revoke', {
      email: 'revoke@fpt.edu.vn',
      fullName: 'Revoke User',
      passwordHash: 'hash_pass',
      role: 'ORGANIZER',
      status: 'ACTIVE',
    }));

    orgUseCase = new OrganizationUseCase(orgModel, membershipModel, userRepo);
    oppUseCase = new OpportunityUseCase(oppRepo);
    appUseCase = new ApplicationUseCase(appRepo, oppRepo, cryptoService);
    teamUseCase = new TeamUseCase(teamRepo, chatRepo);
    chatUseCase = new ChatUseCase(chatRepo, teamRepo);
  });

  // -----------------------------------------------------------------------
  // TEST 1: QUYỀN ĐƠN VỊ & ADMIN CẤP/THU QUYỀN MEMBERSHIP
  // -----------------------------------------------------------------------
  describe('1. API Organization & Membership Quyền Đơn Vị', () => {
    it('Admin tạo tổ chức và cấp quyền cho Organizer A và B thành công', async () => {
      // Admin tạo Org A
      const orgA = await orgUseCase.createOrganization({
        name: 'Đại học Công nghệ Thông tin - UIT',
        website: 'https://uit.edu.vn',
      });
      expect(orgA.id).toBeDefined();
      expect(orgA.status).toBe('ACTIVE');

      // Admin gán Organizer A vào Org A
      const memberA: any = await orgUseCase.assignOrganizer(orgA.id, adminActor.userId, {
        userEmail: organizerOrgA.email,
        role: 'ORGANIZER_MEMBER',
      });
      const membershipA = memberA.membership || memberA;
      expect(membershipA.status).toBe('ACTIVE');
      expect(membershipA.organizationId).toBe(orgA.id);

      // Admin tạo Org B và gán Organizer B
      const orgB = await orgUseCase.createOrganization({
        name: 'Đại học Khoa học Tự nhiên - HCMUS',
      });
      const memberB: any = await orgUseCase.assignOrganizer(orgB.id, adminActor.userId, {
        userEmail: organizerOrgB.email,
        role: 'ORGANIZER_ADMIN',
      });
      const membershipB = memberB.membership || memberB;
      expect(membershipB.status).toBe('ACTIVE');
    });

    it('Admin thu hồi quyền Organizer và vô hiệu hóa phiên làm việc', async () => {
      const org = await orgUseCase.createOrganization({ name: 'FPT Software Academy' });
      await orgUseCase.assignOrganizer(org.id, adminActor.userId, {
        userEmail: 'revoke@fpt.edu.vn',
        role: 'ORGANIZER_MEMBER',
      });

      // Admin thu hồi quyền
      const revoked = await orgUseCase.revokeOrganizerMembership(org.id, adminActor.userId, {
        userId: 'usr_to_revoke',
        reason: 'Hết hạn hợp tác đơn vị',
      });

      expect(revoked.membership.status).toBe('REVOKED');
      expect(userRepo.revokedSessions.has('all_usr_to_revoke')).toBe(true);

      // Kiểm tra thành viên đã bị thu hồi không còn active
      const activeMem = await membershipModel.findOne({ userId: 'usr_to_revoke', status: 'ACTIVE' }).exec();
      expect(activeMem).toBeNull();
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
        previewId: 'prev_01',
        snapshotId: 'snap_01',
        profileVersion: 1,
        payloadHash: 'hash_01',
        consentId: 'consent_01',
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
      ).rejects.toThrow('Xung đột phiên bản dữ liệu');
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
      const room = new ChatRoom('room_team_001', {
        type: 'TEAM',
        refId: 'team_001',
        participants: [leaderId, memberId],
        lastSeq: 0,
      });
      await chatRepo.saveRoom(room);

      // 2. Thành viên gửi tin nhắn khi còn trong đội -> Thành công
      const msg1 = await chatUseCase.sendMessage(room.id, memberId, {
        content: 'Chào cả đội, mình vừa chuẩn bị tài liệu xong!',
        clientMsgId: 'msg_001',
      });
      expect(msg1.seq).toBe(1);

      // 3. Thành viên rời đội -> cập nhật phòng chat loại bỏ memberId
      room.removeParticipant(memberId);
      await chatRepo.updateRoom(room);

      // 4. Thành viên đã rời đội cố gắng gửi tin nhắn -> BỊ CHẶN 403 Forbidden
      await expect(
        chatUseCase.sendMessage(room.id, memberId, {
          content: 'Tin nhắn sau khi đã rời đội',
          clientMsgId: 'msg_002',
        }),
      ).rejects.toThrow();

      // 5. Thành viên đã rời đội cố gắng đọc lịch sử tin nhắn -> BỊ CHẶN 403 Forbidden
      await expect(
        chatUseCase.getMessages(room.id, memberId, {} as any),
      ).rejects.toThrow();
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
        minSize: 2,
        maxSize: 4,
        members: [
          { studentId: leaderId, role: 'LEADER', joinedAt: new Date() },
          { studentId: 'usr_mem_02', role: 'MEMBER', joinedAt: new Date() },
        ],
        status: 'SUBMITTING',
        rosterVersion: 1,
        fencingToken: 1,
        currentReservationId: 'res_crash_001',
        version: 1,
      });
      await teamRepo.save(team);
      await teamRepo.saveActiveMembership({
        id: `mem_${leaderId}`,
        competitionId,
        studentId: leaderId,
        teamId,
        role: 'LEADER',
        joinedAt: new Date(),
      });
      await teamRepo.saveActiveMembership({
        id: `mem_usr_mem_02`,
        competitionId,
        studentId: 'usr_mem_02',
        teamId,
        role: 'MEMBER',
        joinedAt: new Date(),
      });

      // Đội PrepareSubmission -> Chuyển sang SUBMITTING với reservation lease
      const reservation = new SubmissionReservation('res_crash_001', {
        teamId,
        competitionId,
        fencingToken: 1,
        rosterVersion: 1,
        members: [leaderId, 'usr_mem_02'],
        leaseExpiresAt: new Date(Date.now() - 1000), // Quá khứ -> Expired
        status: 'PENDING',
        consents: [
          { studentId: leaderId, consentId: 'c1', snapshotId: 'snap_1', payloadHash: 'hash_1', profileVersion: 1, rosterVersion: 1, confirmedAt: new Date() },
          { studentId: 'usr_mem_02', consentId: 'c2', snapshotId: 'snap_2', payloadHash: 'hash_2', profileVersion: 1, rosterVersion: 1, confirmedAt: new Date() },
        ],
      });
      await teamRepo.saveReservation(reservation);

      const submittingTeam = await teamRepo.findById(teamId);
      expect(submittingTeam?.status).toBe('SUBMITTING');

      // Worker phát hiện reservation quá hạn:
      const expiredList = await teamRepo.findExpiredPendingReservations();
      expect(expiredList.length).toBe(1);

      // Mô phỏng Opportunity Service xử lý abortIntent khi Worker gọi
      const abortOutcome = await appUseCase.abortSubmissionIntent({
        teamId,
        reservationId: reservation.id,
        fencingToken: 1,
        reason: 'Worker Lease Timeout',
      });

      expect(abortOutcome.outcome).toBe('ABORTED');

      // Worker tiến hành mở khóa an toàn cho đội trở về trạng thái ACTIVE
      reservation.abort();
      await teamRepo.updateReservation(reservation);

      submittingTeam?.abortSubmission(reservation.id);
      if (submittingTeam) {
        await teamRepo.update(submittingTeam);
      }

      const finalTeam = await teamRepo.findById(teamId);
      expect(finalTeam?.status).toBe('ACTIVE');
      expect(finalTeam?.currentReservationId).toBeUndefined();
    });
  });
});
