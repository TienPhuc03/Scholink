import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const IDENTITY_DB = process.env.IDENTITY_DB_NAME || 'scholink_identity';
const OPPORTUNITY_DB = process.env.OPPORTUNITY_DB_NAME || 'scholink_opportunity';
const BILLING_DB = process.env.BILLING_DB_NAME || 'scholink_billing';
const NOTIFICATION_DB = process.env.NOTIFICATION_DB_NAME || 'scholink_notification';

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
  const Organization = conn.model('organizations', orgSchema);
  const Membership = conn.model('organization_memberships', membershipSchema);
  const Passport = conn.model('passports', passportSchema);

  const adminHash = await bcrypt.hash(SEED_ADMIN_PASS, 10);
  await User.updateOne(
    { normalizedEmail: 'admin@scholink.edu.vn' },
    {
      $setOnInsert: {
        id: adminId,
        email: 'admin@scholink.edu.vn',
        normalizedEmail: 'admin@scholink.edu.vn',
        passwordHash: adminHash,
        fullName: 'Hệ Thống Quản Trị Scholink',
        role: 'ADMIN',
        status: 'ACTIVE',
        sessionVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  const orgHash = await bcrypt.hash(SEED_ORG_PASS, 10);
  await User.updateOne(
    { normalizedEmail: 'organizer@scholink.edu.vn' },
    {
      $setOnInsert: {
        id: organizerId,
        email: 'organizer@scholink.edu.vn',
        normalizedEmail: 'organizer@scholink.edu.vn',
        passwordHash: orgHash,
        fullName: 'Ban Tổ Chức VinAI Innovation Lab',
        role: 'ORGANIZER',
        status: 'ACTIVE',
        sessionVersion: 1,
        version: 1,
      },
    },
    { upsert: true },
  );

  await Organization.updateOne(
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

  await Membership.updateOne(
    { organizationId: orgId, userId: organizerId },
    {
      $setOnInsert: {
        id: 'mem_vinai_001',
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

  const studentHash = await bcrypt.hash(SEED_STUDENT_PASS, 10);
  await User.updateOne(
    { normalizedEmail: 'student@scholink.edu.vn' },
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
        id: `pass_${studentId}`,
        studentId,
        fullName: 'Nguyễn Văn Sinh Viên',
        bio: 'Sinh viên năm 3 ngành Khoa học Máy tính Đại học Bách Khoa, đam mê AI & Hệ thống Phân tán.',
        regionCode: 'VN-SG',
        avatarAssetId: 'asset_avatar_001',
        education: {
          institution: 'Đại học Bách Khoa TP.HCM',
          major: 'Khoa học Máy tính',
          startYear: 2023,
          endYear: 2027,
          gpa: 3.82,
          gpaScale: 4,
        },
        certificates: [
          {
            type: 'IELTS',
            name: 'IELTS 7.5 Academic',
            score: '7.5',
            issuedDate: new Date('2025-01-15'),
            assetId: 'asset_ielts_001',
            status: 'VERIFIED',
          },
        ],
        skills: ['Python', 'TypeScript', 'Kotlin Jetpack Compose'],
        achievements: [
          'Giải Nhất Học bổng Khuyến khích Học tập HK1 2025',
          'Top 5 Hackathon BK AI Innovators 2025',
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

  await conn.close();
  console.log('  ✅ Hoàn tất Seed cho Identity Database (Users, Organization, Membership, Passport 100%)');
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
      ruleVersion: 1,
      tags: ['AI/ML', 'STEM', 'Toàn phần'],
    },
    {
      id: 'opp_fpt_tech_scholarship_2026',
      dedupKey: 'scholarship:fpt_women_in_tech:2026',
      type: 'SCHOLARSHIP',
      title: 'Học bổng Phát triển Sinh viên Nữ Công nghệ FPT 2026',
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
      ruleVersion: 1,
      tags: ['Công nghệ', 'Nữ sinh', 'Thực tập'],
    },
    {
      id: 'opp_scholink_ai_challenge_2026',
      dedupKey: 'competition:scholink_ai_challenge:2026',
      type: 'COMPETITION',
      title: 'Cuộc thi Scholink AI Challenge 2026 - Đổi mới Sáng tạo Sinh viên',
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
      ruleVersion: 1,
      tags: ['AI Challenge', 'Đội thi', 'Hackathon'],
    },
    {
      id: 'opp_national_startup_hackathon_2026',
      dedupKey: 'competition:national_startup_hackathon:2026',
      type: 'COMPETITION',
      title: 'National Student Startup Hackathon 2026',
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

async function seed() {
  console.log('🌱 Khởi tạo dữ liệu mẫu Idempotent cho hệ thống Scholink Microservices...\n');
  const studentId = 'usr_student_001';
  const organizerId = 'usr_organizer_001';
  const adminId = 'usr_admin_001';
  const orgId = 'org_vinai_001';

  await seedIdentity(studentId, organizerId, adminId, orgId);
  await seedOpportunities(organizerId, orgId);
  await seedBillingAndNotifications(studentId);

  console.log('\n🎉 Khởi tạo dữ liệu mẫu thành công!');
}

seed().catch((err) => {
  console.error('❌ Lỗi khởi tạo dữ liệu:', err);
  process.exit(1);
});
