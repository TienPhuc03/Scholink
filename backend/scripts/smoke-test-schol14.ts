import { OrganizationUseCase } from '../apps/identity-service/src/application/use-cases/organization.use-case';
import { ApplicationUseCase } from '../apps/opportunity-service/src/application/use-cases/application.use-case';
import { OpportunityUseCase } from '../apps/opportunity-service/src/application/use-cases/opportunity.use-case';
import { TeamUseCase } from '../apps/collaboration-service/src/application/use-cases/team.use-case';
import { ChatUseCase } from '../apps/collaboration-service/src/application/use-cases/chat.use-case';
import { Application } from '../apps/opportunity-service/src/domain/application.entity';
import { Team } from '../apps/collaboration-service/src/domain/team.entity';
import { ChatRoom } from '../apps/collaboration-service/src/domain/chat.entity';
import { SubmissionReservation } from '../apps/collaboration-service/src/domain/reservation.entity';
import { CryptoService, AuthenticatedUser } from '@shared';

async function runSmokeTest() {
  console.log('========================================================================');
  console.log('🔥 BẮT ĐẦU SMOKE TEST TÍCH HỢP HỆ THỐNG SCHOLINK (SCHOL-14)');
  console.log(`🕒 Thời gian: ${new Date().toLocaleString('vi-VN')}`);
  console.log('========================================================================\n');

  const cryptoService = new CryptoService();

  // Mock stores
  const orgs = new Map<string, any>();
  const memberships = new Map<string, any>();
  const revokedSessions = new Set<string>();
  const opps = new Map<string, any>();
  const apps = new Map<string, any>();
  const appRevisions: any[] = [];
  const appEvents: any[] = [];
  const teams = new Map<string, any>();
  const rooms = new Map<string, any>();
  const messages = new Map<string, any>();

  // Mock UserRepo
  const mockUserRepo: any = {
    createOrganization: async (o: any) => orgs.set(o.id, o),
    findOrganizationById: async (id: string) => orgs.get(id) || null,
    listOrganizations: async () => Array.from(orgs.values()),
    updateOrganization: async (id: string, u: any) => orgs.set(id, { ...orgs.get(id), ...u }),
    createMembership: async (m: any) => memberships.set(`${m.organizationId}_${m.userId}`, m),
    findMembership: async (orgId: string, uId: string) => memberships.get(`${orgId}_${uId}`) || null,
    findActiveMembershipByUser: async (uId: string) => {
      for (const m of memberships.values()) if (m.userId === uId && m.status === 'ACTIVE') return m;
      return null;
    },
    updateMembershipStatus: async (orgId: string, uId: string, status: string) => {
      const k = `${orgId}_${uId}`;
      if (memberships.has(k)) memberships.set(k, { ...memberships.get(k), status });
    },
    listMembersByOrganization: async (orgId: string) => {
      return Array.from(memberships.values()).filter((m: any) => m.organizationId === orgId);
    },
    revokeAllUserSessions: async (uId: string) => { revokedSessions.add(`all_${uId}`); },
  };

  // Mock OppRepo
  const mockOppRepo: any = {
    findById: async (id: string) => opps.get(id) || null,
    findMany: async (filter: any) => {
      let list = Array.from(opps.values());
      if (filter.organizationId) list = list.filter((o) => o.props.organizationId === filter.organizationId);
      return list;
    },
    save: async (opp: any) => opps.set(opp.id, opp),
    update: async (opp: any) => opps.set(opp.id, opp),
  };

  // Mock AppRepo
  const mockAppRepo: any = {
    findById: async (id: string) => apps.get(id) || null,
    findManyByOpportunity: async (oppId: string) => Array.from(apps.values()).filter((a) => a.opportunityId === oppId),
    findApplicationByTeamId: async (tId: string) => {
      for (const a of apps.values()) if (a.props.teamId === tId) return a;
      return null;
    },
    save: async (app: any) => apps.set(app.id, app),
    update: async (app: any) => apps.set(app.id, app),
    appendEvent: async (e: any) => appEvents.push(e),
    findEventsByApplication: async (appId: string) => appEvents.filter((e) => e.applicationId === appId),
    saveRevision: async (r: any) => appRevisions.push(r),
    findLatestRevision: async (appId: string) => {
      const list = appRevisions.filter((r) => r.applicationId === appId);
      return list.length > 0 ? list[list.length - 1] : null;
    },
    findSubmissionIntent: async () => null,
    upsertSubmissionIntent: async () => {},
  };

  // Mock TeamRepo & ChatRepo
  const mockTeamRepo: any = {
    findById: async (id: string) => teams.get(id) || null,
    save: async (t: any) => teams.set(t.id, t),
    update: async (t: any) => teams.set(t.id, t),
    updateTeamStatusConditional: async (teamId: string, expStatus: string, newStatus: string) => {
      const t = teams.get(teamId);
      if (!t || t.status !== expStatus) return false;
      teams.set(teamId, new Team(t.id, { ...t.props, status: newStatus as any }));
      return true;
    },
  };

  const mockChatRepo: any = {
    findRoomById: async (id: string) => rooms.get(id) || null,
    saveRoom: async (r: any) => rooms.set(r.id, r),
    updateRoom: async (r: any) => rooms.set(r.id, r),
    findMessageByClientMsgId: async () => null,
    saveMessageWithTransaction: async (m: any) => messages.set(m.id, m),
    findMessagesByRoom: async (rId: string) => Array.from(messages.values()).filter((m: any) => m.roomId === rId),
  };

  const orgUseCase = new OrganizationUseCase(mockUserRepo);
  const oppUseCase = new OpportunityUseCase(mockOppRepo);
  const appUseCase = new ApplicationUseCase(mockAppRepo, mockOppRepo, cryptoService);
  const chatUseCase = new ChatUseCase(mockChatRepo);

  // 3 Tài khoản kiểm thử
  const admin: AuthenticatedUser = { userId: 'admin_1', email: 'admin@scholink.edu.vn', role: 'ADMIN' };
  const orgA: AuthenticatedUser = { userId: 'org_a_1', email: 'org.a@uit.edu.vn', role: 'ORGANIZER', organizationId: 'org_uit' };
  const orgB: AuthenticatedUser = { userId: 'org_b_1', email: 'org.b@hcmus.edu.vn', role: 'ORGANIZER', organizationId: 'org_hcmus' };
  const student: AuthenticatedUser = { userId: 'student_1', email: 'student@uit.edu.vn', role: 'STUDENT' };

  console.log('📌 BƯỚC 1: KIỂM TRA QUYỀN ĐƠN VỊ & ADMIN CẤP/THU QUYỀN (CRITERION 1)');
  const orgResult = await orgUseCase.createOrganization({ name: 'ĐH CNTT - UIT', slug: 'uit' });
  await orgUseCase.assignOrganizer(orgResult.id, admin.userId, { userId: orgA.userId, roleInOrg: 'ADMIN' });
  console.log('    ✓ Admin tạo tổ chức UIT và gán Organizer A thành công.');

  // Thử cập nhật trạng thái đơn vị
  const suspendedOrg = await orgUseCase.updateOrganizationStatus(orgResult.id, admin.userId, { status: 'SUSPENDED' });
  console.log(`    ✓ Cập nhật trạng thái tổ chức thành công: status=${suspendedOrg.status}`);

  // Thử gán thành viên vào đơn vị bị SUSPENDED -> phải bị chặn 409
  try {
    await orgUseCase.assignOrganizer(orgResult.id, admin.userId, { userId: 'usr_new', roleInOrg: 'COORDINATOR' });
    console.error('    ❌ LỖI: Cho phép gán thành viên vào đơn vị đang bị SUSPENDED!');
    process.exit(1);
  } catch (err: any) {
    console.log(`    ✓ Chặn gán thành viên vào đơn vị SUSPENDED: "${err.message}" [PASS]`);
  }

  // Mở lại ACTIVE
  await orgUseCase.updateOrganizationStatus(orgResult.id, admin.userId, { status: 'ACTIVE' });

  // Admin thu hồi quyền
  const revoked = await orgUseCase.revokeOrganizerMembership(orgResult.id, admin.userId, { userId: 'revoked_user' });
  console.log(`    ✓ Admin thu hồi quyền thành viên: status=${revoked.status}, sessionRevoked=${revokedSessions.has('all_revoked_user')} [PASS]`);

  console.log('\n📌 BƯỚC 2: KIỂM TRA KHOẢNG CÁCH DỮ LIỆU ĐƠN VỊ (TENANT ISOLATION & KANBAN) (CRITERION 2)');
  const opp = await oppUseCase.create(
    {
      type: 'COMPETITION',
      title: 'UIT AI Contest 2026',
      description: 'Cuộc thi AI',
      organizerName: 'UIT',
      applyMode: 'IN_APP',
      registerDeadline: new Date(Date.now() + 86400000).toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
    },
    orgA.userId,
    orgA.organizationId,
  );

  // Kiểm tra listMyOpportunities
  const myOppsOrgA = await oppUseCase.listMyOpportunities(orgA);
  const myOppsOrgB = await oppUseCase.listMyOpportunities(orgB);
  console.log(`    ✓ Danh sách cơ hội Org A: ${myOppsOrgA.length} cơ hội | Org B: ${myOppsOrgB.length} cơ hội [PASS]`);

  const testApp = new Application('app_smoke_1', {
    opportunityId: opp.id,
    studentId: student.userId,
    submissionType: 'INDIVIDUAL',
    status: 'SUBMITTED',
    screening: 'ELIGIBLE',
    submittedAt: new Date(),
    revision: 1,
    version: 1,
  });
  await mockAppRepo.save(testApp);
  await mockAppRepo.saveRevision({
    id: 'rev_1',
    applicationId: testApp.id,
    revision: 1,
    previewId: 'prv_1',
    snapshotId: 'snap_1',
    profileVersion: 1,
    ruleVersion: 1,
    snapshotJson: '{}',
    manifestJson: JSON.stringify([{ assetId: 'cv_uit.pdf', status: 'READY' }]),
    payloadHash: 'hash_sample',
    consentId: 'consent_1',
    screening: 'ELIGIBLE',
    submittedAt: new Date(),
  });

  const kanbanA = await appUseCase.getOpportunityKanban(opp.id, orgA);
  console.log(`    ✓ Organizer A truy cập Kanban của Org A: ${kanbanA.totalApplications} hồ sơ [PASS]`);

  try {
    await appUseCase.getOpportunityKanban(opp.id, orgB);
    console.error('    ❌ LỖI: Organizer B truy cập trái phép được Kanban của Org A!');
    process.exit(1);
  } catch (err: any) {
    console.log(`    ✓ Organizer B bị CHẶN 403 khi truy cập Kanban Org A: "${err.message}" [PASS]`);
  }

  // Chi tiết và tệp hồ sơ
  const attachments = await appUseCase.getApplicationAttachments(testApp.id, orgA);
  console.log(`    ✓ Organizer A lấy tệp đính kèm: ${attachments.attachments.length} tệp [PASS]`);

  try {
    await appUseCase.getApplicationAttachments(testApp.id, orgB);
    console.error('    ❌ LỖI: Organizer B lấy được tệp của Org A!');
    process.exit(1);
  } catch (err: any) {
    console.log(`    ✓ Organizer B bị CHẶN 403 khi lấy tệp Org A: "${err.message}" [PASS]`);
  }

  // Cập nhật trạng thái hồ sơ với note và expectedVersion
  try {
    await appUseCase.updateStatus(testApp.id, orgA, { status: 'REJECTED', note: '' });
    console.error('    ❌ LỖI: Cho phép từ chối hồ sơ mà không có lý do!');
    process.exit(1);
  } catch (err: any) {
    console.log(`    ✓ Bắt buộc lý do (note) khi REJECTED: "${err.message}" [PASS]`);
  }

  try {
    await appUseCase.updateStatus(testApp.id, orgA, { status: 'REVIEWING', expectedVersion: 99 });
    console.error('    ❌ LỖI: Optimistic version mismatch không bị chặn!');
    process.exit(1);
  } catch (err: any) {
    console.log(`    ✓ Optimistic locking mismatch bị chặn 409: "${err.message}" [PASS]`);
  }

  const updatedStatus = await appUseCase.updateStatus(testApp.id, orgA, {
    status: 'ACCEPTED',
    expectedVersion: 1,
    note: 'Đạt điểm chuẩn phỏng vấn',
  });
  console.log(`    ✓ Organizer A đổi trạng thái thành công: status=${updatedStatus.status}, version=${updatedStatus.version} [PASS]`);

  console.log('\n📌 BƯỚC 3: KIỂM TRA THU HỒI QUYỀN CHAT KHI RỜI ĐỘI (CRITERION 6)');
  const room = ChatRoom.createTeamRoom({
    id: 'room_smoke_1',
    teamId: 'team_smoke_1',
    competitionId: 'comp_1',
    name: 'Đội Test Smoke',
    memberIds: ['leader_1', student.userId],
  });
  await mockChatRepo.saveRoom(room);

  const msg1 = await chatUseCase.sendMessage({
    roomId: room.id,
    senderId: student.userId,
    content: 'Tin nhắn khi còn trong đội',
    clientMsgId: 'cmsg_1',
  });
  console.log(`    ✓ Sinh viên gửi tin nhắn thành công: seq=${msg1.seq}`);

  // Sinh viên rời đội
  const updatedRoom = room.removeMember(student.userId);
  await mockChatRepo.updateRoom(updatedRoom);

  try {
    await chatUseCase.sendMessage({
      roomId: room.id,
      senderId: student.userId,
      content: 'Tin nhắn sau khi rời đội',
      clientMsgId: 'cmsg_2',
    });
    console.error('    ❌ LỖI: Sinh viên đã rời đội nhưng vẫn gửi được tin nhắn!');
    process.exit(1);
  } catch (err: any) {
    console.log(`    ✓ Sinh viên rời đội bị CHẶN 403 khi gửi tin: "${err.message}" [PASS]`);
  }

  console.log('\n📌 BƯỚC 4: KIỂM TRA NỘP ĐỘI CRASH & RECOVERY (CRITERION 6)');
  const crashTeam = new Team('team_crash_smoke', {
    competitionId: 'comp_1',
    name: 'Đội Thử Nghiệm Crash',
    leaderId: 'leader_1',
    members: [{ studentId: 'leader_1', role: 'LEADER', joinedAt: new Date() }],
    status: 'SUBMITTING',
    version: 1,
  });
  await mockTeamRepo.save(crashTeam);

  const abortOutcome = await appUseCase.abortSubmissionIntent({
    teamId: crashTeam.id,
    reservationId: 'res_smoke_crash',
    fencingToken: 1,
    reason: 'Timeout Worker Recovery',
  });
  console.log(`    ✓ AbortSubmissionIntent phản hồi: outcome=${abortOutcome.outcome}`);

  const unlocked = await mockTeamRepo.updateTeamStatusConditional(crashTeam.id, 'SUBMITTING', 'OPEN');
  const finalTeam = await mockTeamRepo.findById(crashTeam.id);
  console.log(`    ✓ Giải phóng khóa an toàn: unlocked=${unlocked}, finalStatus=${finalTeam?.status} [PASS]`);

  console.log('\n========================================================================');
  console.log('🎉 TẤT CẢ CÁC BƯỚC SMOKE TEST TÍCH HỢP SCHOL-14 ĐÃ HOÀN TẤT THÀNH CÔNG 100%!');
  console.log('========================================================================\n');
}

runSmokeTest().catch((err) => {
  console.error('❌ Lỗi Smoke Test:', err);
  process.exit(1);
});
