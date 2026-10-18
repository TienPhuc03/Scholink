import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const IDENTITY_DB = process.env.IDENTITY_DB_NAME || 'scholink_identity';
const OPPORTUNITY_DB = process.env.OPPORTUNITY_DB_NAME || 'scholink_opportunity';
const BILLING_DB = process.env.BILLING_DB_NAME || 'scholink_billing';
const NOTIFICATION_DB = process.env.NOTIFICATION_DB_NAME || 'scholink_notification';

async function seed() {
  console.log('🌱 Bắt đầu khởi tạo dữ liệu mẫu cho hệ thống Scholink Microservices...\n');

  // ==========================================
  // 1. IDENTITY SERVICE SEED
  // ==========================================
  console.log(`📦 Kết nối tới ${IDENTITY_DB}...`);
  const identityConn = await mongoose.createConnection(`${MONGODB_URI}/${IDENTITY_DB}`).asPromise();

  const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true },
    role: { type: String, required: true, enum: ['STUDENT', 'ORGANIZER', 'ADMIN'] },
    status: { type: String, required: true, default: 'ACTIVE' },
    version: { type: Number, default: 1 },
  }, { timestamps: true });

  const passportSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    bio: String,
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
    version: { type: Number, default: 1 },
  }, { timestamps: true });

  const User = identityConn.model('users', userSchema);
  const Passport = identityConn.model('passports', passportSchema);

  const studentId = 'usr_student_001';
  const organizerId = 'usr_organizer_001';
  const adminId = 'usr_admin_001';

  // Seed Admin
  const adminExists = await User.findOne({ email: 'admin@scholink.edu.vn' });
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('ScholinkAdmin@2026', 10);
    await User.create({
      id: adminId,
      email: 'admin@scholink.edu.vn',
      passwordHash,
      fullName: 'Hệ Thống Quản Trị Scholink',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    console.log('  ✅ Tạo Admin: admin@scholink.edu.vn / ScholinkAdmin@2026');
  }

  // Seed Organizer
  const orgExists = await User.findOne({ email: 'organizer@scholink.edu.vn' });
  if (!orgExists) {
    const passwordHash = await bcrypt.hash('Organizer@2026', 10);
    await User.create({
      id: organizerId,
      email: 'organizer@scholink.edu.vn',
      passwordHash,
      fullName: 'Ban Tổ Chức VinAI Innovation Lab',
      role: 'ORGANIZER',
      status: 'ACTIVE',
    });
    console.log('  ✅ Tạo Organizer: organizer@scholink.edu.vn / Organizer@2026');
  }

  // Seed Student
  const studentExists = await User.findOne({ email: 'student@scholink.edu.vn' });
  if (!studentExists) {
    const passwordHash = await bcrypt.hash('Student@2026', 10);
    await User.create({
      id: studentId,
      email: 'student@scholink.edu.vn',
      passwordHash,
      fullName: 'Nguyễn Văn Sinh Viên',
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    console.log('  ✅ Tạo Student: student@scholink.edu.vn / Student@2026');

    // Create 100% completed Passport for Student
    await Passport.create({
      id: `pass_${crypto.randomUUID()}`,
      studentId: studentId,
      fullName: 'Nguyễn Văn Sinh Viên',
      bio: 'Sinh viên năm 3 ngành Khoa học Máy tính Đại học Bách Khoa, đam mê AI, Deep Learning và các dự án vì cộng đồng.',
      avatarAssetId: 'asset_avatar_001',
      education: {
        school: 'Đại học Bách Khoa TP.HCM',
        major: 'Khoa học Máy tính',
        gpa: 3.82,
        graduationYear: 2027,
      },
      certificates: [
        { name: 'IELTS 7.5 Academic', issuer: 'British Council', year: 2024 },
        { name: 'Deep Learning Specialization', issuer: 'DeepLearning.AI', year: 2025 },
      ],
      skills: ['Python', 'PyTorch', 'TypeScript', 'NestJS', 'Kotlin Jetpack Compose'],
      achievements: [
        'Giải Nhất Học bổng Khuyến khích Học tập HK1 2025',
        'Top 5 Hackathon BK AI Innovators 2025',
      ],
      cvAssetId: 'asset_cv_nguyen_van_sinh_vien.pdf',
      pitchVideoAssetId: 'asset_pitch_video_2026.mp4',
      isLookingForTeammate: true,
      isOpenForScholarship: true,
      isOpenForMentoring: true,
      completionScore: 100, // 7/7 component hoàn chỉnh
    });
    console.log('  ✅ Khởi tạo Passport 100% completion score cho Student');
  }

  await identityConn.close();

  // ==========================================
  // 2. OPPORTUNITY SERVICE SEED
  // ==========================================
  console.log(`\n📦 Kết nối tới ${OPPORTUNITY_DB}...`);
  const oppConn = await mongoose.createConnection(`${MONGODB_URI}/${OPPORTUNITY_DB}`).asPromise();

  const oppSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    type: { type: String, required: true, enum: ['SCHOLARSHIP', 'COMPETITION'] },
    title: { type: String, required: true },
    description: { type: String, required: true },
    organizationId: String,
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
    eligibilityRules: [Object],
    tags: [String],
    version: { type: Number, default: 1 },
  }, { timestamps: true });

  const Opportunity = oppConn.model('opportunities', oppSchema);

  const sampleOpportunities = [
    {
      id: 'opp_vinai_scholarship_2026',
      type: 'SCHOLARSHIP',
      title: 'Học bổng Nghiên cứu Tài năng Trẻ VinAI 2026',
      description: 'Chương trình học bổng toàn phần dành cho sinh viên xuất sắc các ngành CNTT, Toán-Tin, Khoa học dữ liệu trên toàn quốc, tài trợ toàn bộ học phí và kinh phí nghiên cứu.',
      organizationId: organizerId,
      organizerName: 'Viện Nghiên cứu Trí tuệ Nhân tạo VinAI',
      applyMode: 'IN_APP',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-12-31T23:59:59+07:00'),
      submitDeadline: new Date('2026-12-31T23:59:59+07:00'),
      fundingLevel: 'FULL',
      tags: ['AI/ML', 'STEM', 'Toàn phần', 'Học phí'],
    },
    {
      id: 'opp_fpt_tech_scholarship_2026',
      type: 'SCHOLARSHIP',
      title: 'Học bổng Phát triển Sinh viên Nữ Công nghệ FPT 2026',
      description: 'Hỗ trợ các nữ sinh viên theo đuổi ngành kỹ thuật công nghệ thông tin và viễn thông, bao gồm học bổng tiền mặt và cơ hội thực tập trực tiếp.',
      organizationId: organizerId,
      organizerName: 'Tập đoàn FPT',
      applyMode: 'IN_APP',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-11-30T23:59:59+07:00'),
      submitDeadline: new Date('2026-11-30T23:59:59+07:00'),
      fundingLevel: 'PARTIAL',
      tags: ['Công nghệ', 'Nữ sinh', 'Thực tập'],
    },
    {
      id: 'opp_scholink_ai_challenge_2026',
      type: 'COMPETITION',
      title: 'Cuộc thi Scholink AI Challenge 2026 - Đổi mới Sáng tạo Sinh viên',
      description: 'Đấu trường AI thường niên lớn nhất dành cho sinh viên đại học. Thi đấu theo đội từ 2-4 thành viên, giải quyết bài toán thực tế về xử lý ngôn ngữ tự nhiên và thị giác máy tính.',
      organizationId: organizerId,
      organizerName: 'Scholink Community & Đối tác',
      applyMode: 'IN_APP',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-12-15T23:59:59+07:00'),
      submitDeadline: new Date('2026-12-20T23:59:59+07:00'),
      competitionMode: 'TEAM',
      minTeamSize: 2,
      maxTeamSize: 4,
      tags: ['AI Challenge', 'Đội thi', 'Hackathon', 'Giải thưởng lớn'],
    },
    {
      id: 'opp_national_startup_hackathon_2026',
      type: 'COMPETITION',
      title: 'National Student Startup Hackathon 2026',
      description: 'Cuộc thi khởi nghiệp đổi mới sáng tạo quốc gia dành cho sinh viên các trường đại học, kết nối quỹ đầu tư mạo hiểm và doanh nghiệp lớn.',
      organizationId: organizerId,
      organizerName: 'Bộ Khoa học và Công nghệ & VCCI',
      sourceUrl: 'https://nationalstartuphackathon.gov.vn',
      applyMode: 'EXTERNAL',
      status: 'PUBLISHED',
      registerDeadline: new Date('2026-11-15T23:59:59+07:00'),
      competitionMode: 'TEAM',
      minTeamSize: 3,
      maxTeamSize: 5,
      tags: ['Khởi nghiệp', 'Startup', 'Đổi mới sáng tạo'],
    },
  ];

  for (const opp of sampleOpportunities) {
    const exists = await Opportunity.findOne({ id: opp.id });
    if (!exists) {
      await Opportunity.create(opp);
      console.log(`  ✅ Tạo cơ hội: [${opp.type}] ${opp.title}`);
    }
  }

  await oppConn.close();

  // ==========================================
  // 3. BILLING SERVICE SEED
  // ==========================================
  console.log(`\n📦 Kết nối tới ${BILLING_DB}...`);
  const billingConn = await mongoose.createConnection(`${MONGODB_URI}/${BILLING_DB}`).asPromise();

  const walletSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true },
    balanceVnd: { type: Number, required: true, default: 0 },
    heldVnd: { type: Number, required: true, default: 0 },
    version: { type: Number, default: 1 },
  }, { timestamps: true });

  const Wallet = billingConn.model('wallets', walletSchema);

  const walletExists = await Wallet.findOne({ userId: studentId });
  if (!walletExists) {
    await Wallet.create({
      id: `wal_${crypto.randomUUID()}`,
      userId: studentId,
      balanceVnd: 500000, // 500.000 VND số nguyên
      heldVnd: 0,
    });
    console.log('  ✅ Khởi tạo Ví VND cho Student: 500,000 VND');
  }

  await billingConn.close();

  // ==========================================
  // 4. NOTIFICATION SERVICE SEED
  // ==========================================
  console.log(`\n📦 Kết nối tới ${NOTIFICATION_DB}...`);
  const notifyConn = await mongoose.createConnection(`${MONGODB_URI}/${NOTIFICATION_DB}`).asPromise();

  const notifySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    refUrl: String,
    isRead: { type: Boolean, default: false },
    readAt: Date,
  }, { timestamps: true });

  const Notification = notifyConn.model('notifications', notifySchema);

  const notifyExists = await Notification.findOne({ userId: studentId });
  if (!notifyExists) {
    await Notification.create({
      id: `notif_${crypto.randomUUID()}`,
      userId: studentId,
      type: 'SYSTEM_WELCOME',
      title: 'Chào mừng bạn đến với Scholink!',
      body: 'Hồ sơ Passport của bạn đã sẵn sàng! Bạn có thể bắt đầu khám phá các học bổng và cuộc thi hấp dẫn ngay hôm nay.',
      refUrl: '/passport',
      isRead: false,
    });
    console.log('  ✅ Tạo thông báo chào mừng cho Student');
  }

  await notifyConn.close();

  console.log('\n🎉 Hoàn thành khởi tạo dữ liệu mẫu thành công!');
  console.log('----------------------------------------------------');
  console.log('Tài khoản kiểm thử đã sẵn sàng:');
  console.log('  1. ADMIN:     admin@scholink.edu.vn     / ScholinkAdmin@2026');
  console.log('  2. ORGANIZER: organizer@scholink.edu.vn / Organizer@2026');
  console.log('  3. STUDENT:   student@scholink.edu.vn   / Student@2026');
  console.log('----------------------------------------------------');
}

seed().catch((err) => {
  console.error('❌ Lỗi khởi tạo dữ liệu:', err);
  process.exit(1);
});
