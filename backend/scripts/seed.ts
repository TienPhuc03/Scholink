import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';

declare const process: any;
declare const crypto: any;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const IDENTITY_DB = process.env.IDENTITY_DB_NAME || 'scholink_identity';
const OPPORTUNITY_DB = process.env.OPPORTUNITY_DB_NAME || 'scholink_opportunity';
const BILLING_DB = process.env.BILLING_DB_NAME || 'scholink_billing';
const NOTIFICATION_DB = process.env.NOTIFICATION_DB_NAME || 'scholink_notification';
const COLLAB_DB = process.env.COLLABORATION_DB_NAME || 'scholink_collaboration';

const SEED_ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || 'ScholinkAdmin@2026';
const SEED_ORG_PASS = process.env.SEED_ORGANIZER_PASSWORD || 'Organizer@2026';
const SEED_STUDENT_PASS = process.env.SEED_STUDENT_PASSWORD || 'Student@2026';

async function seedIdentity(studentId: string, organizerId: string, adminId: string, orgId: string) {
  console.log(`📦 Kết nối tới ${IDENTITY_DB}...`);
  const conn = await mongoose.createConnection(`${MONGODB_URI}/${IDENTITY_DB}`).asPromise();

  const userSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      email: { type: String, required: true },
      normalizedEmail: { type: String, required: true, unique: true },
      passwordHash: { type: String, required: true },
      fullName: { type: String, required: true },
      role: { type: String, required: true, enum: ['STUDENT', 'ORGANIZER', 'ADMIN'] },
      status: { type: String, required: true, default: 'ACTIVE' },
      sessionVersion: { type: Number, default: 1 },
      version: { type: Number, default: 1 },
    },
    { timestamps: true },
  );

  const orgSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      status: { type: String, required: true, default: 'ACTIVE' },
      verifiedBy: String,
      verifiedAt: Date,
      version: { type: Number, default: 1 },
    },
    { timestamps: true },
  );

  const membershipSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      organizationId: { type: String, required: true },
      userId: { type: String, required: true },
      status: { type: String, required: true, default: 'ACTIVE' },
      grantedBy: { type: String, required: true },
      grantedAt: { type: Date, default: () => new Date() },
      version: { type: Number, default: 1 },
    },
    { timestamps: true },
  );

  const passportSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true, unique: true },
      fullName: { type: String, required: true },
      bio: String,
      regionCode: String,
      avatarAssetId: String,
      education: Object,
      certificates: [Object],
      skills: [String],
      achievements: [String],
      cvAssetId: String,
      pitchVideoAssetId: String,
      isLookingForTeammate: { type: Boolean, default: false },
      isOpenForScholarship: { type: Boolean, default: false },
      isOpenForMentoring: { type: Boolean, default: false },
      completionScore: { type: Number, default: 0 },
      scoreVersion: { type: Number, default: 1 },
      version: { type: Number, default: 1 },
    },
    { timestamps: true },
  );

  const User = conn.model('users', userSchema);
  const Org = conn.model('organizations', orgSchema);
  const Membership = conn.model('organization_memberships', membershipSchema);
  const Passport = conn.model('passports', passportSchema);

  // 1. Tổ chức VinAI
  await Org.updateOne(
    { id: orgId },
    {
      $setOnInsert: {
        id: orgId,
        name: 'Viện Nghiên cứu Trí tuệ Nhân tạo VinAI',
        status: 'ACTIVE',
        verifiedBy: adminId,
        verifiedAt: new Date(),
        version: 1,
      },
    },
    { upsert: true },
  );

  // 2. Admin
  const adminHash = await bcrypt.hash(SEED_ADMIN_PASS, 10);
  await User.updateOne(
    { id: adminId },
    {
      $setOnInsert: {
        id: adminId,
        email: 'admin@scholink.edu.vn',
        normalizedEmail: 'admin@scholink.edu.vn',
        passwordHash: adminHash,
        fullName: 'Hệ Thống Quản Trị Viên',
        role: 'ADMIN',
        status: 'ACTIVE',
        sessionVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  // 3. Organizer
  const orgHash = await bcrypt.hash(SEED_ORG_PASS, 10);
  await User.updateOne(
    { id: organizerId },
    {
      $setOnInsert: {
        id: organizerId,
        email: 'organizer@scholink.edu.vn',
        normalizedEmail: 'organizer@scholink.edu.vn',
        passwordHash: orgHash,
        fullName: 'Đại Diện Tuyển Dụng VinAI',
        role: 'ORGANIZER',
        status: 'ACTIVE',
        sessionVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  await Membership.updateOne(
    { organizationId: orgId, userId: organizerId },
    {
      $setOnInsert: {
        id: `mem_${organizerId}_${orgId}`,
        organizationId: orgId,
        userId: organizerId,
        status: 'ACTIVE',
        grantedBy: adminId,
        grantedAt: new Date(),
        version: 1,
      },
    },
    { upsert: true },
  );

  // 4. Student
  const studentHash = await bcrypt.hash(SEED_STUDENT_PASS, 10);
  await User.updateOne(
    { id: studentId },
    {
      $setOnInsert: {
        id: studentId,
        email: 'student@scholink.edu.vn',
        normalizedEmail: 'student@scholink.edu.vn',
        passwordHash: studentHash,
        fullName: 'Nguyễn Văn Sinh Viên',
        role: 'STUDENT',
        status: 'ACTIVE',
        sessionVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  await Passport.updateOne(
    { studentId },
    {
      $setOnInsert: {
        id: `psp_${studentId}`,
        studentId,
        fullName: 'Nguyễn Văn Sinh Viên',
        bio: 'Sinh viên năm 3 chuyên ngành Trí tuệ Nhân tạo - Bách Khoa TP.HCM',
        regionCode: 'VN-SG',
        avatarAssetId: 'asset_avatar_001.png',
        education: {
          institution: 'Đại học Bách Khoa TP.HCM',
          major: 'Khoa học Máy tính',
          startYear: 2023,
          gpa: 3.82,
          gpaScale: 4.0,
        },
        certificates: [
          {
            type: 'LANGUAGE',
            name: 'IELTS Academic',
            score: '7.5',
            issuedDate: '2025-06-15T00:00:00.000Z',
            status: 'SELF_DECLARED',
          },
        ],
        skills: ['Python', 'PyTorch', 'TypeScript', 'NestJS', 'Docker', 'gRPC'],
        achievements: [
          'Giải Nhất Nghiên cứu Khoa học Sinh viên Cấp Trường 2025',
          'Học bổng Khuyến khích Học tập Xuất sắc 4 kỳ liên tiếp',
        ],
        cvAssetId: 'asset_cv_nguyen_van_sinh_vien.pdf',
        pitchVideoAssetId: 'asset_pitch_video_2026.mp4',
        isLookingForTeammate: true,
        isOpenForScholarship: true,
        isOpenForMentoring: true,
        completionScore: 100,
        scoreVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  // 5. Sinh viên 2 (Ứng viên A)
  await User.updateOne(
    { id: 'usr_student_002' },
    {
      $setOnInsert: {
        id: 'usr_student_002',
        email: 'applicant1@scholink.edu.vn',
        normalizedEmail: 'applicant1@scholink.edu.vn',
        passwordHash: studentHash,
        fullName: 'Trần Thị Ứng Viên 1',
        role: 'STUDENT',
        status: 'ACTIVE',
        sessionVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );
  await Passport.updateOne(
    { studentId: 'usr_student_002' },
    {
      $setOnInsert: {
        id: 'psp_usr_student_002',
        studentId: 'usr_student_002',
        fullName: 'Trần Thị Ứng Viên 1',
        bio: 'Sinh viên năm 2 ngành Trí tuệ Nhân tạo',
        skills: ['Python', 'FastAPI', 'PyTorch'],
        completionScore: 90,
        scoreVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  // 6. Sinh viên 3 (Ứng viên B)
  await User.updateOne(
    { id: 'usr_student_003' },
    {
      $setOnInsert: {
        id: 'usr_student_003',
        email: 'applicant2@scholink.edu.vn',
        normalizedEmail: 'applicant2@scholink.edu.vn',
        passwordHash: studentHash,
        fullName: 'Lê Văn Ứng Viên 2',
        role: 'STUDENT',
        status: 'ACTIVE',
        sessionVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );
  await Passport.updateOne(
    { studentId: 'usr_student_003' },
    {
      $setOnInsert: {
        id: 'psp_usr_student_003',
        studentId: 'usr_student_003',
        fullName: 'Lê Văn Ứng Viên 2',
        bio: 'Sinh viên năm 3 ngành Kỹ thuật Phần mềm',
        skills: ['Flutter', 'React', 'NodeJS'],
        completionScore: 85,
        scoreVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  await conn.close();
  console.log('  ✅ Hoàn tất Seed cho Identity Database (Users, Organization, Membership, 3 Students & Passports)');
}

async function seedOpportunities(organizerId: string, orgId: string) {
  console.log(`\n📦 Kết nối tới ${OPPORTUNITY_DB}...`);
  const conn = await mongoose.createConnection(`${MONGODB_URI}/${OPPORTUNITY_DB}`).asPromise();

  const oppSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      dedupKey: { type: String, unique: true, sparse: true },
      type: { type: String, required: true, enum: ['SCHOLARSHIP', 'COMPETITION'] },
      title: { type: String, required: true },
      slug: String,
      description: { type: String, required: true },
      organizationId: String,
      createdBy: String,
      organizerName: { type: String, required: true },
      sourceUrl: String,
      applyMode: { type: String, required: true, enum: ['IN_APP', 'EXTERNAL'], default: 'IN_APP' },
      status: { type: String, required: true, default: 'PUBLISHED' },
      registerDeadline: { type: Date, required: true },
      submitDeadline: Date,
      timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
      fundingLevel: String,
      minGpa: { type: Number, default: 0 },
      requiredIelts: { type: Number, default: 0 },
      coverImageUrl: String,
      isPromoted: { type: Boolean, default: false },
      competitionMode: String,
      minTeamSize: Number,
      maxTeamSize: Number,
      ruleVersion: { type: Number, default: 1 },
      tags: [String],
      version: { type: Number, default: 1 },
    },
    { timestamps: true },
  );

  const Opportunity = conn.model('opportunities', oppSchema);

  const items = [
    {
      id: 'opp_vinai_scholarship_2026',
      dedupKey: 'scholarship:vinai_young_talent:2026',
      type: 'SCHOLARSHIP',
      title: 'Học bổng Nghiên cứu Tài năng Trẻ VinAI 2026',
      slug: 'hoc-bong-nghien-cuu-tai-nang-tre-vinai-2026',
      description:
        'Chương trình học bổng toàn phần dành cho sinh viên xuất sắc các ngành CNTT, Toán-Tin, Khoa học dữ liệu trên toàn quốc.',
      organizationId: orgId,
      createdBy: organizerId,
      organizerName: 'Viện Nghiên cứu Trí tuệ Nhân tạo VinAI',
      applyMode: 'IN_APP',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-12-31T23:59:59+07:00'),
      submitDeadline: new Date('2026-12-31T23:59:59+07:00'),
      fundingLevel: 'FULL',
      minGpa: 3.2,
      requiredIelts: 6.5,
      isPromoted: true,
      ruleVersion: 1,
      tags: ['AI/ML', 'STEM', 'Toàn phần'],
    },
    {
      id: 'opp_fpt_tech_scholarship_2026',
      dedupKey: 'scholarship:fpt_women_in_tech:2026',
      type: 'SCHOLARSHIP',
      title: 'Học bổng Phát triển Sinh viên Nữ Công nghệ FPT 2026',
      slug: 'hoc-bong-phat-trien-sinh-vien-nu-cong-nghe-fpt-2026',
      description:
        'Hỗ trợ các nữ sinh viên theo đuổi ngành kỹ thuật công nghệ thông tin và viễn thông kèm cơ hội thực tập trực tiếp.',
      organizationId: orgId,
      createdBy: organizerId,
      organizerName: 'Tập đoàn FPT',
      applyMode: 'IN_APP',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-11-30T23:59:59+07:00'),
      submitDeadline: new Date('2026-11-30T23:59:59+07:00'),
      fundingLevel: 'PARTIAL',
      minGpa: 3.0,
      ruleVersion: 1,
      tags: ['Công nghệ', 'Nữ sinh', 'Thực tập'],
    },
    {
      id: 'opp_scholink_ai_challenge_2026',
      dedupKey: 'competition:scholink_ai_challenge:2026',
      type: 'COMPETITION',
      title: 'Cuộc thi Scholink AI Challenge 2026 - Đổi mới Sáng tạo Sinh viên',
      slug: 'cuoc-thi-scholink-ai-challenge-2026',
      description:
        'Đấu trường AI thường niên dành cho sinh viên đại học. Thi đấu theo đội từ 2-4 thành viên giải quyết bài toán thực tế.',
      organizationId: orgId,
      createdBy: organizerId,
      organizerName: 'Scholink Community & Đối tác',
      applyMode: 'IN_APP',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-12-15T23:59:59+07:00'),
      submitDeadline: new Date('2026-12-20T23:59:59+07:00'),
      competitionMode: 'TEAM',
      minTeamSize: 2,
      maxTeamSize: 4,
      isPromoted: true,
      ruleVersion: 1,
      tags: ['AI Challenge', 'Đội thi', 'Hackathon'],
    },
    {
      id: 'opp_national_startup_hackathon_2026',
      dedupKey: 'competition:national_startup_hackathon:2026',
      type: 'COMPETITION',
      title: 'National Student Startup Hackathon 2026',
      slug: 'national-student-startup-hackathon-2026',
      description:
        'Cuộc thi khởi nghiệp đổi mới sáng tạo quốc gia dành cho sinh viên các trường đại học trên toàn quốc.',
      organizerName: 'Bộ Khoa học và Công nghệ & VCCI',
      sourceUrl: 'https://nationalstartuphackathon.gov.vn',
      applyMode: 'EXTERNAL',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-11-15T23:59:59+07:00'),
      competitionMode: 'TEAM',
      minTeamSize: 3,
      maxTeamSize: 5,
      ruleVersion: 1,
      tags: ['Khởi nghiệp', 'Startup'],
    },
  ];

  for (const opp of items) {
    await Opportunity.updateOne({ id: opp.id }, { $setOnInsert: opp }, { upsert: true });
  }

  await conn.close();
  console.log('  ✅ Hoàn tất Seed cho Opportunity Database (4 Cơ hội chuẩn IN_APP & EXTERNAL)');
}

async function seedBillingAndNotifications(studentId: string) {
  const billingConn = await mongoose.createConnection(`${MONGODB_URI}/${BILLING_DB}`).asPromise();
  const walletSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true, unique: true },
      balanceVnd: { type: Number, required: true, default: 0 },
      heldVnd: { type: Number, required: true, default: 0 },
      version: { type: Number, default: 1 },
    },
    { timestamps: true },
  );
  const Wallet = billingConn.model('wallets', walletSchema);
  await Wallet.updateOne(
    { userId: studentId },
    {
      $setOnInsert: {
        id: `wal_${studentId}`,
        userId: studentId,
        balanceVnd: 500000,
        heldVnd: 0,
        version: 1,
      },
    },
    { upsert: true },
  );
  await billingConn.close();

  const notifyConn = await mongoose
    .createConnection(`${MONGODB_URI}/${NOTIFICATION_DB}`)
    .asPromise();
  const notifySchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      businessKey: { type: String, unique: true, sparse: true },
      type: { type: String, required: true },
      title: { type: String, required: true },
      body: { type: String, required: true },
      refUrl: String,
      isRead: { type: Boolean, default: false },
    },
    { timestamps: true },
  );
  const Notification = notifyConn.model('notifications', notifySchema);
  await Notification.updateOne(
    { userId: studentId, businessKey: `welcome:${studentId}` },
    {
      $setOnInsert: {
        id: `notif_${crypto.randomUUID()}`,
        userId: studentId,
        businessKey: `welcome:${studentId}`,
        type: 'SYSTEM_WELCOME',
        title: 'Chào mừng bạn đến với Scholink!',
        body: 'Hồ sơ Passport của bạn đã sẵn sàng để ứng tuyển học bổng và cuộc thi.',
        refUrl: '/passport',
        isRead: false,
      },
    },
    { upsert: true },
  );
  await notifyConn.close();
  console.log('  ✅ Hoàn tất Seed cho Billing & Notification Databases');
}

async function seedCollaboration(studentId: string) {
  console.log(`\n📦 Kết nối tới ${COLLAB_DB}...`);
  const collabConn = await mongoose.createConnection(`${MONGODB_URI}/${COLLAB_DB}`).asPromise();

  const teamCollabSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      competitionId: { type: String, required: true },
      name: { type: String, required: true },
      description: String,
      leaderId: { type: String, required: true },
      minSize: { type: Number, default: 2 },
      maxSize: { type: Number, default: 4 },
      status: { type: String, default: 'ACTIVE' },
      members: [Object],
      rosterVersion: { type: Number, default: 1 },
      fencingToken: { type: Number, default: 0 },
    },
    { timestamps: true },
  );

  const activeMemSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      studentId: { type: String, required: true },
      competitionId: { type: String, required: true },
      teamId: { type: String, required: true },
      role: { type: String, default: 'MEMBER' },
      joinedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
  );

  const chatRoomSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      type: { type: String, required: true },
      refId: String,
      participants: [String],
      lastSeq: { type: Number, default: 0 },
      lastMessageSnippet: String,
      lastMessageAt: Date,
    },
    { timestamps: true },
  );

  const msgSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      roomId: { type: String, required: true },
      senderId: { type: String, required: true },
      seq: { type: Number, required: true },
      clientMsgId: String,
      content: { type: String, required: true },
      readBy: [String],
    },
    { timestamps: true },
  );

  const TeamCollab = collabConn.model('teams', teamCollabSchema);
  const ActiveMemCollab = collabConn.model('active_memberships', activeMemSchema);
  const RoomCollab = collabConn.model('chat_rooms', chatRoomSchema);
  const MsgCollab = collabConn.model('messages', msgSchema);

  const teamId = 'team_bk_ai_innovators';
  await TeamCollab.updateOne(
    { id: teamId },
    {
      $setOnInsert: {
        id: teamId,
        competitionId: 'opp_scholink_ai_challenge_2026',
        name: 'BK AI Innovators Team',
        description: 'Đội thi Đại học Bách Khoa tham gia giải quyết bài toán thị giác máy tính',
        leaderId: studentId,
        minSize: 2,
        maxSize: 2,
        status: 'FORMING',
        members: [
          { studentId, role: 'LEADER', joinedAt: new Date() },
        ],
        rosterVersion: 1,
        fencingToken: 0,
      },
    },
    { upsert: true },
  );

  await ActiveMemCollab.updateOne(
    { competitionId: 'opp_scholink_ai_challenge_2026', studentId },
    {
      $setOnInsert: {
        id: `mem_${studentId}_bk_ai`,
        studentId,
        competitionId: 'opp_scholink_ai_challenge_2026',
        teamId,
        role: 'LEADER',
      },
    },
    { upsert: true },
  );

  const roomId = 'room_team_bk_ai_innovators';
  await RoomCollab.updateOne(
    { id: roomId },
    {
      $setOnInsert: {
        id: roomId,
        type: 'TEAM',
        refId: teamId,
        participants: [studentId],
        lastSeq: 2,
        lastMessageSnippet: 'Chào các bạn! Chúng ta cùng chuẩn bị tài liệu nộp đề xuất dự án nhé.',
        lastMessageAt: new Date(),
      },
    },
    { upsert: true },
  );

  await MsgCollab.updateOne(
    { id: 'msg_001' },
    {
      $setOnInsert: {
        id: 'msg_001',
        roomId,
        senderId: studentId,
        seq: 1,
        clientMsgId: 'cmsg_001',
        content: 'Chào mừng các thành viên đã tham gia đội BK AI Innovators!',
        readBy: [studentId],
      },
    },
    { upsert: true },
  );

  await MsgCollab.updateOne(
    { id: 'msg_002' },
    {
      $setOnInsert: {
        id: 'msg_002',
        roomId,
        senderId: studentId,
        seq: 2,
        clientMsgId: 'cmsg_002',
        content: 'Chào các bạn! Chúng ta cùng chuẩn bị tài liệu nộp đề xuất dự án nhé.',
        readBy: [studentId],
      },
    },
    { upsert: true },
  );

  await collabConn.close();
  console.log('  ✅ Hoàn tất Seed cho Collaboration Database (Team FORMING 1/2 slot, Chat room & Messages)');
}

async function seed() {
  console.log('🌱 Khởi tạo dữ liệu mẫu Idempotent cho hệ thống Scholink Microservices...\n');
  const studentId = 'usr_student_001';
  const organizerId = 'usr_organizer_001';
  const adminId = 'usr_admin_001';
  const orgId = 'org_vinai_001';

  await seedIdentity(studentId, organizerId, adminId, orgId);
  await seedOpportunities(organizerId, orgId);
  await seedBillingAndNotifications(studentId);
  await seedCollaboration(studentId);

  console.log('\n🎉 Hoàn thành khởi tạo dữ liệu mẫu thành công!');
  console.log('----------------------------------------------------');
  console.log('Tài khoản kiểm thử đã sẵn sàng:');
  console.log('  1. ADMIN:       admin@scholink.edu.vn      / ScholinkAdmin@2026');
  console.log('  2. ORGANIZER:   organizer@scholink.edu.vn  / Organizer@2026');
  console.log('  3. STUDENT 1:   student@scholink.edu.vn    / Student@2026 (Trưởng đội BK AI)');
  console.log('  4. STUDENT 2:   applicant1@scholink.edu.vn / Student@2026 (Ứng viên A)');
  console.log('  5. STUDENT 3:   applicant2@scholink.edu.vn / Student@2026 (Ứng viên B - Tranh slot)');
  console.log('----------------------------------------------------');
}

seed().catch((err) => {
  console.error('❌ Lỗi khởi tạo dữ liệu:', err);
  process.exit(1);
});
