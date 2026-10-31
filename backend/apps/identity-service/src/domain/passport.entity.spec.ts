import { Passport, PassportProps } from './passport.entity';

describe('Passport Entity & 7-Component Score Calculation (SRS Mục 12A)', () => {
  const baseProps: PassportProps = {
    studentId: 'student_test_001',
    profileVersion: 1,
    fullName: 'Nguyễn Văn A',
    isLookingForTeammate: false,
    isOpenForScholarship: false,
    isOpenForMentoring: false,
  };

  it('should initialize with basic score for minimum valid full name', () => {
    const passport = new Passport('pass_001', baseProps);

    // Full name >= 2 chars = 10 points
    expect(passport.scoreBreakdown.basicScore).toBe(10);
    expect(passport.scoreBreakdown.educationScore).toBe(0);
    expect(passport.scoreBreakdown.certificateScore).toBe(0);
    expect(passport.scoreBreakdown.achievementScore).toBe(0);
    expect(passport.scoreBreakdown.skillScore).toBe(0);
    expect(passport.scoreBreakdown.cvOrVideoScore).toBe(0);
    expect(passport.scoreBreakdown.intentScore).toBe(0);
    expect(passport.completionScore).toBe(10);
  });

  it('should award 20 basic points when avatar and bio/region are provided', () => {
    const passport = new Passport('pass_002', {
      ...baseProps,
      avatarAssetId: 'asset_avatar_123',
      bio: 'Sinh viên năm 3 yêu thích khoa học dữ liệu',
      regionCode: 'VN-SG',
    });

    // 10 (name) + 5 (avatar) + 5 (bio/region) = 20
    expect(passport.scoreBreakdown.basicScore).toBe(20);
  });

  it('should compute education score correctly (15 for school/major + 10 for valid GPA)', () => {
    // School + Major only -> 15
    const partialEdu = new Passport('pass_003', {
      ...baseProps,
      education: {
        institution: 'Đại học Bách Khoa TP.HCM',
        major: 'Khoa học Máy tính',
      },
    });
    expect(partialEdu.scoreBreakdown.educationScore).toBe(15);

    // School + Major + valid GPA -> 25
    const fullEdu = new Passport('pass_004', {
      ...baseProps,
      education: {
        institution: 'Đại học Bách Khoa TP.HCM',
        major: 'Khoa học Máy tính',
        gpa: 3.85,
        gpaScale: 4.0,
      },
    });
    expect(fullEdu.scoreBreakdown.educationScore).toBe(25);
  });

  it('should normalize and deduplicate skills case-insensitively, capping at 15 points (3 skills * 5)', () => {
    const passport = new Passport('pass_005', {
      ...baseProps,
      skills: ['Python', 'python', 'PYTHON', ' TypeScript ', 'Docker', 'Kubernetes'],
    });

    // Unique skills: Python, TypeScript, Docker, Kubernetes (4 unique skills)
    // Capped at 15 points (3 skills * 5 points = 15)
    expect(passport.scoreBreakdown.skillScore).toBe(15);
  });

  it('should award 10 points for certificates and 15 points for achievements', () => {
    const passport = new Passport('pass_006', {
      ...baseProps,
      certificates: [
        {
          type: 'LANGUAGE',
          name: 'IELTS Academic 8.0',
          issuedDate: new Date('2025-01-01'),
          status: 'SELF_DECLARED',
        },
      ],
      achievements: ['Giải Nhất Hackathon AI 2025'],
    });

    expect(passport.scoreBreakdown.certificateScore).toBe(10);
    expect(passport.scoreBreakdown.achievementScore).toBe(15);
  });

  it('should reach exactly 100/100 points when all 7 components are fulfilled', () => {
    const perfectPassport = new Passport('pass_100', {
      studentId: 'student_perfect',
      profileVersion: 1,
      fullName: 'Trần Thị Xuất Sắc',
      avatarAssetId: 'avatar_999',
      regionCode: 'VN-HN',
      bio: 'Fullstack & Machine Learning Enthusiast',
      education: {
        institution: 'Đại học Quốc gia Hà Nội',
        major: 'Công nghệ Thông tin',
        gpa: 3.92,
        gpaScale: 4.0,
      },
      certificates: [
        {
          type: 'LANGUAGE',
          name: 'TOEFL iBT 110',
          issuedDate: new Date('2025-06-01'),
          status: 'VERIFIED',
        },
      ],
      achievements: ['Quán quân Nghiên cứu Khoa học Sinh viên'],
      skills: ['NestJS', 'React', 'MongoDB'],
      cvAssetId: 'asset_cv_perfect_pdf',
      isLookingForTeammate: true,
      isOpenForScholarship: true,
      isOpenForMentoring: false,
    });

    const breakdown = perfectPassport.scoreBreakdown;
    expect(breakdown.basicScore).toBe(20);
    expect(breakdown.educationScore).toBe(25);
    expect(breakdown.certificateScore).toBe(10);
    expect(breakdown.achievementScore).toBe(15);
    expect(breakdown.skillScore).toBe(15);
    expect(breakdown.cvOrVideoScore).toBe(5);
    expect(breakdown.intentScore).toBe(10);
    expect(breakdown.totalScore).toBe(100);
    expect(perfectPassport.completionScore).toBe(100);
  });
});
