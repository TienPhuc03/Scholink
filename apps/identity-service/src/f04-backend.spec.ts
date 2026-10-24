import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import {
  CryptoService,
  DomainException,
  ErrorCode,
  sanitizeInput,
  sanitizePlainText,
  validateEnv,
} from '@shared';
import { User } from './domain/user.entity';
import { Passport } from './domain/passport.entity';
import { Consent } from './domain/consent.entity';
import { OtpRecord } from './domain/otp-record.entity';
import { MediaAsset } from './domain/media-asset.entity';
import { IUserRepository, SessionRecord } from './domain/ports/user.repository.port';
import { IPassportRepository } from './domain/ports/passport.repository.port';
import { AuthUseCase } from './application/use-cases/auth.use-case';
import { MediaUseCase } from './application/use-cases/media.use-case';
import { PassportUseCase } from './application/use-cases/passport.use-case';
import { ApplicationUseCase } from '../../opportunity-service/src/application/use-cases/application.use-case';
import { Opportunity } from '../../opportunity-service/src/domain/opportunity.entity';
import { Application } from '../../opportunity-service/src/domain/application.entity';
import {
  IApplicationRepository,
  SubmissionPreviewRecord,
} from '../../opportunity-service/src/domain/ports/application.repository.port';
import { IOpportunityRepository } from '../../opportunity-service/src/domain/ports/opportunity.repository.port';

describe('F04 & F13 Backend — Security, Immutability, OTP, MediaAsset & Cross-Service Invariants', () => {
  const validJwtSecret = 'test_jwt_secret_minimum_32_characters_long_123';
  const validEncryptionKey = 'test_encryption_key_min_32_chars_long_456';
  let cryptoService: CryptoService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = validJwtSecret;
    process.env.ENCRYPTION_KEY = validEncryptionKey;
    cryptoService = new CryptoService(new ConfigService({ ENCRYPTION_KEY: validEncryptionKey }));
  });

  describe('1. Security Checklist & Boundary Validation', () => {
    it('fails loudly when required secrets are missing or too short', () => {
      expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow(/JWT_SECRET/);
      expect(() =>
        validateEnv({
          JWT_SECRET: 'short',
          ENCRYPTION_KEY: validEncryptionKey,
        }),
      ).toThrow(/32 ký tự/);
      expect(() =>
        validateEnv({
          JWT_SECRET: 'replace_with_at_least_32_character_random_jwt_secret_key',
          ENCRYPTION_KEY: validEncryptionKey,
        }),
      ).toThrow(/placeholder/);
    });

    it('sanitizes HTML tags and rejects NoSQL injection operator keys at boundary', () => {
      const sanitized = sanitizeInput({
        fullName: '  <script>alert(1)</script>Nguyen Van A  ',
        skills: ['<b>TypeScript</b>', '  NestJS  '],
      }) as { fullName: string; skills: string[] };

      expect(sanitized.fullName).toBe('alert(1)Nguyen Van A');
      expect(sanitized.skills).toEqual(['TypeScript', 'NestJS']);
      expect(sanitizePlainText('<script>evil()</script><b>Clean Text</b>')).toBe('Clean Text');

      expect(() =>
        sanitizeInput({
          email: { $ne: null },
        }),
      ).toThrow(DomainException);
    });

    it('computes deterministic RFC 8785 SHA-256 payloadHash regardless of key order', () => {
      const hashA = cryptoService.generatePayloadHash({
        b: 2,
        a: { y: 'hello', x: 1 },
      });
      const hashB = cryptoService.generatePayloadHash({
        a: { x: 1, y: 'hello' },
        b: 2,
      });

      expect(hashA).toBe(hashB);
    });
  });

  describe('2. Domain Immutability & Mục 12A Completion Score', () => {
    it('enforces immutable updates on User and Passport and computes 7-component score + scoreBreakdown', () => {
      const initialPassport = new Passport('pass_1', {
        studentId: 'stu_1',
        profileVersion: 1,
        fullName: 'Nguyen Van A',
        isLookingForTeammate: false,
        isOpenForScholarship: false,
        isOpenForMentoring: false,
      });

      expect(initialPassport.profileVersion).toBe(1);
      expect(initialPassport.completionScore).toBe(10); // Only fullName (10 pts)
      expect(initialPassport.scoreBreakdown.basicScore).toBe(10);
      expect(initialPassport.getMissingFields()).toContain('education.institution');

      const updatedPassport = initialPassport.updateProfile({
        avatarAssetId: 'ast_avatar',
        regionCode: 'VN-SG',
        education: {
          institution: 'UIT - VNUHCM',
          major: 'Software Engineering',
          startYear: 2023,
          gpa: 3.6,
          gpaScale: 4,
        },
        skills: ['TypeScript', 'typescript', 'NestJS', 'gRPC'],
        achievements: ['First Prize Hackathon'],
        certificates: [
          {
            type: 'LANGUAGE',
            name: 'IELTS',
            score: '7.5',
            issuedDate: new Date(),
            status: 'VERIFIED',
          },
        ],
        cvAssetId: 'ast_cv',
        isLookingForTeammate: true,
      });

      // Original instance remains untouched (Immutable)
      expect(initialPassport.profileVersion).toBe(1);
      expect(initialPassport.completionScore).toBe(10);

      // New instance has version + 1, deduplicated skills, and 100/100 score
      expect(updatedPassport.profileVersion).toBe(2);
      expect(updatedPassport.props.skills).toEqual(['TypeScript', 'NestJS', 'gRPC']);
      expect(updatedPassport.completionScore).toBe(100);
      expect(updatedPassport.scoreBreakdown).toEqual({
        basicScore: 20,
        educationScore: 25,
        certificateScore: 10,
        achievementScore: 15,
        skillScore: 15,
        cvOrVideoScore: 5,
        intentScore: 10,
        totalScore: 100,
      });
      expect(updatedPassport.getMissingFields()).toHaveLength(0);
    });
  });

  describe('3. AuthUseCase (F04 & F13) — Unique Email, OTP Lockout, Password Reset & Refresh Replay', () => {
    let users: Map<string, User>;
    let passports: Map<string, Passport>;
    let sessions: Map<string, SessionRecord>;
    let otpRecords: Map<string, OtpRecord>;
    let authUseCase: AuthUseCase;

    beforeEach(() => {
      users = new Map();
      passports = new Map();
      sessions = new Map();
      otpRecords = new Map();

      const userRepo: IUserRepository = {
        findById: async (id) => users.get(id) ?? null,
        findByEmail: async (email) =>
          Array.from(users.values()).find((u) => u.normalizedEmail === email.toLowerCase()) ??
          null,
        save: async (u) => {
          users.set(u.id, u);
        },
        update: async (u) => {
          users.set(u.id, u);
        },
        saveSession: async (s) => {
          sessions.set(s.id, s);
        },
        findSessionByTokenHash: async (hash) =>
          Array.from(sessions.values()).find((s) => s.tokenHash === hash) ?? null,
        markSessionUsed: async (sessionId) => {
          const current = sessions.get(sessionId);
          if (current) {
            sessions.set(sessionId, { ...current, isUsed: true });
          }
        },
        revokeSessionFamily: async (familyId) => {
          for (const [id, s] of sessions.entries()) {
            if (s.familyId === familyId) {
              sessions.set(id, { ...s, isRevoked: true });
            }
          }
        },
        revokeAllUserSessions: async (userId) => {
          for (const [id, s] of sessions.entries()) {
            if (s.userId === userId) {
              sessions.set(id, { ...s, isRevoked: true });
            }
          }
        },
        findOtpRecord: async (email, purpose) =>
          otpRecords.get(`${email.toLowerCase()}:${purpose}`) ?? null,
        saveOtpRecord: async (rec) => {
          otpRecords.set(`${rec.normalizedEmail}:${rec.purpose}`, rec);
        },
        deleteOtpRecord: async (email, purpose) => {
          otpRecords.delete(`${email.toLowerCase()}:${purpose}`);
        },
      };

      const passportRepo: IPassportRepository = {
        findByStudentId: async (studentId) => passports.get(studentId) ?? null,
        save: async (p) => {
          passports.set(p.studentId, p);
        },
        update: async (p) => {
          passports.set(p.studentId, p);
        },
        saveConsent: async () => undefined,
        findConsentById: async () => null,
        saveMediaAsset: async () => undefined,
        updateMediaAsset: async () => undefined,
        findMediaAssetById: async () => null,
        findMediaAssetsByIds: async () => [],
      };

      const jwtService = new JwtService({ secret: validJwtSecret });
      authUseCase = new AuthUseCase(userRepo, passportRepo, jwtService, cryptoService);
    });

    it('enforces unique email (EMAIL_ALREADY_EXISTS), assigns STUDENT role, and revokes token family on refresh replay', async () => {
      const reg = await authUseCase.register({
        email: 'student@uit.edu.vn',
        password: 'StrongPassword123',
        fullName: 'Nguyen Van A',
      });

      expect(reg.role).toBe('STUDENT');
      expect(passports.has(reg.userId)).toBe(true);

      // Duplicate registration must fail with EMAIL_ALREADY_EXISTS
      await expect(
        authUseCase.register({
          email: 'STUDENT@uit.edu.vn',
          password: 'AnotherPassword123',
          fullName: 'Duplicate User',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
      });

      const loginRes = await authUseCase.login({
        email: 'student@uit.edu.vn',
        password: 'StrongPassword123',
      });

      // 1st refresh rotates token and marks first session as isUsed = true
      const rotated = await authUseCase.refresh({
        refreshToken: loginRes.refreshToken,
      });
      expect(rotated.accessToken).toBeDefined();

      // Replaying the old refreshToken must throw UNAUTHENTICATED and revoke the entire familyId!
      await expect(
        authUseCase.refresh({
          refreshToken: loginRes.refreshToken,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.UNAUTHENTICATED,
      });

      // Even the newly rotated token in the same family is now revoked!
      await expect(
        authUseCase.refresh({
          refreshToken: rotated.refreshToken,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.UNAUTHENTICATED,
      });
    });

    it('enforces OTP 60s resend cooldown, locks after 5 failed attempts, and revokes old sessions on password reset', async () => {
      await authUseCase.register({
        email: 'otp_user@uit.edu.vn',
        password: 'OldPassword123',
        fullName: 'Tran Thi OTP',
      });

      const loginBeforeReset = await authUseCase.login({
        email: 'otp_user@uit.edu.vn',
        password: 'OldPassword123',
      });

      // Send OTP for email verification
      const otpRes = await authUseCase.sendOtp({
        email: 'otp_user@uit.edu.vn',
        purpose: 'VERIFY_EMAIL',
      });
      expect(otpRes.sent).toBe(true);
      expect(otpRes.devOtpPreview).toMatch(/^\d{6}$/);

      // Immediate resend within 60s must be blocked with RATE_LIMITED
      await expect(
        authUseCase.sendOtp({
          email: 'otp_user@uit.edu.vn',
          purpose: 'VERIFY_EMAIL',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.RATE_LIMITED,
      });

      // 4 wrong OTP attempts throw OTP_INVALID, 5th attempt locks for 15 minutes with OTP_LOCKED
      for (let i = 1; i <= 4; i++) {
        await expect(
          authUseCase.verifyOtp({
            email: 'otp_user@uit.edu.vn',
            otpCode: '000000',
            purpose: 'VERIFY_EMAIL',
          }),
        ).rejects.toMatchObject({
          code: ErrorCode.OTP_INVALID,
        });
      }

      await expect(
        authUseCase.verifyOtp({
          email: 'otp_user@uit.edu.vn',
          otpCode: '000000',
          purpose: 'VERIFY_EMAIL',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.OTP_LOCKED,
      });

      // Forgot password & Reset password flow (uses separate purpose 'RESET_PASSWORD')
      const forgotRes = await authUseCase.forgotPassword({
        email: 'otp_user@uit.edu.vn',
      });
      expect(forgotRes.sent).toBe(true);
      expect(forgotRes.devOtpPreview).toMatch(/^\d{6}$/);

      const resetRes = await authUseCase.resetPassword({
        email: 'otp_user@uit.edu.vn',
        otpCode: forgotRes.devOtpPreview,
        newPassword: 'NewStrongPassword@2026',
      });
      expect(resetRes.passwordReset).toBe(true);
      expect(resetRes.sessionVersion).toBe(2);

      // Old refreshToken issued before password reset must now be rejected!
      await expect(
        authUseCase.refresh({
          refreshToken: loginBeforeReset.refreshToken,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.UNAUTHENTICATED,
      });

      // Login with new password succeeds
      const loginAfterReset = await authUseCase.login({
        email: 'otp_user@uit.edu.vn',
        password: 'NewStrongPassword@2026',
      });
      expect(loginAfterReset.accessToken).toBeDefined();
    });
  });

  describe('4. F13 MediaAsset Inspection, Passport Optimistic Version & Asset Ownership Invariants', () => {
    let passports: Map<string, Passport>;
    let mediaAssets: Map<string, MediaAsset>;
    let mediaUseCase: MediaUseCase;
    let passportUseCase: PassportUseCase;
    const studentA = 'stu_A';
    const studentB = 'stu_B';

    beforeEach(() => {
      passports = new Map();
      mediaAssets = new Map();

      passports.set(
        studentA,
        new Passport('pass_A', {
          studentId: studentA,
          profileVersion: 1,
          fullName: 'Student A',
          isLookingForTeammate: false,
          isOpenForScholarship: true,
          isOpenForMentoring: false,
        }),
      );

      passports.set(
        studentB,
        new Passport('pass_B', {
          studentId: studentB,
          profileVersion: 1,
          fullName: 'Student B',
          isLookingForTeammate: false,
          isOpenForScholarship: true,
          isOpenForMentoring: false,
        }),
      );

      const passportRepo: IPassportRepository = {
        findByStudentId: async (id) => passports.get(id) ?? null,
        save: async (p) => {
          passports.set(p.studentId, p);
        },
        update: async (p) => {
          passports.set(p.studentId, p);
        },
        saveConsent: async () => undefined,
        findConsentById: async () => null,
        saveMediaAsset: async (asset) => {
          mediaAssets.set(asset.id, asset);
        },
        updateMediaAsset: async (asset) => {
          mediaAssets.set(asset.id, asset);
        },
        findMediaAssetById: async (id) => mediaAssets.get(id) ?? null,
        findMediaAssetsByIds: async (ids) =>
          ids.map((id) => mediaAssets.get(id)).filter((a): a is MediaAsset => Boolean(a)),
      };

      mediaUseCase = new MediaUseCase(passportRepo, cryptoService);
      passportUseCase = new PassportUseCase(passportRepo, mediaUseCase, cryptoService);
    });

    it('validates MIME/size, blocks EICAR/malicious files, blocks non-READY assets, and rejects another users asset', async () => {
      // 1. Invalid MIME type for CV -> INVALID_FILE_TYPE
      await expect(
        mediaUseCase.createUploadUrl(studentA, {
          category: 'CV',
          fileName: 'trojan.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 1024,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_FILE_TYPE,
      });

      // 2. Oversized CV (> 5MB) -> FILE_TOO_LARGE
      await expect(
        mediaUseCase.createUploadUrl(studentA, {
          category: 'CV',
          fileName: 'huge-cv.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 6 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.FILE_TOO_LARGE,
      });

      // 3. Create valid upload URL -> status is UPLOADING
      const initiatedCv = await mediaUseCase.createUploadUrl(studentA, {
        category: 'CV',
        fileName: 'cv-student-a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 250000,
      });
      expect(initiatedCv.status).toBe('UPLOADING');

      // 4. Attempting to attach UPLOADING asset to Passport before completeUpload -> 409 ASSET_NOT_AVAILABLE
      await expect(
        passportUseCase.updateMyPassport(studentA, {
          cvAssetId: initiatedCv.assetId,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.ASSET_NOT_AVAILABLE,
      });

      // 5. Malicious file upload (EICAR or Embedded PDF JS) -> 422 MALICIOUS_FILE_DETECTED and status becomes REJECTED
      const maliciousUpload = await mediaUseCase.createUploadUrl(studentA, {
        category: 'CERTIFICATE',
        fileName: 'infected.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10240,
      });
      await expect(
        mediaUseCase.completeUpload(studentA, maliciousUpload.assetId, {
          fileHeaderHex: '255044462d312e37',
          sampleContent: 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.MALICIOUS_FILE_DETECTED,
      });

      const rejectedAsset = await mediaUseCase.getMediaAsset(studentA, maliciousUpload.assetId);
      expect(rejectedAsset.status).toBe('REJECTED');

      // 6. Complete clean PDF upload for Student A -> status becomes READY
      const completedCv = await mediaUseCase.completeUpload(studentA, initiatedCv.assetId, {
        fileHeaderHex: '255044462d312e37',
        sampleContent: '%PDF-1.7 Clean Academic CV',
        actualSizeBytes: 250000,
      });
      expect(completedCv.status).toBe('READY');

      // 7. Student B attempts to attach Student A's READY asset -> 403 FORBIDDEN_RESOURCE ("không nhận asset người khác")
      await expect(
        passportUseCase.updateMyPassport(studentB, {
          cvAssetId: completedCv.id,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN_RESOURCE,
      });

      // 8. Student A attaches their own READY asset with expectedVersion = 1 -> succeeds and increments version to 2
      const updatedPassportA = await passportUseCase.updateMyPassport(studentA, {
        expectedVersion: 1,
        cvAssetId: completedCv.id,
      });
      expect(updatedPassportA.version).toBe(2);
      expect(updatedPassportA.cvAssetId).toBe(completedCv.id);

      // 9. Stale expectedVersion (1 instead of 2) -> 409 VERSION_MISMATCH
      await expect(
        passportUseCase.updateMyPassport(studentA, {
          expectedVersion: 1,
          bio: 'Outdated version update attempt',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VERSION_MISMATCH,
      });
    });
  });

  describe('5. End-to-End Preview -> Consent -> Submit & Withdraw/Resubmit Workflow', () => {
    let passports: Map<string, Passport>;
    let consents: Map<string, Consent>;
    let mediaAssets: Map<string, MediaAsset>;
    let previews: Map<string, SubmissionPreviewRecord>;
    let applications: Map<string, Application>;
    let mediaUseCase: MediaUseCase;
    let passportUseCase: PassportUseCase;
    let applicationUseCase: ApplicationUseCase;
    const studentId = 'stu_100';
    const opportunityId = 'opp_100';

    beforeEach(() => {
      passports = new Map();
      consents = new Map();
      mediaAssets = new Map();
      previews = new Map();
      applications = new Map();

      const completedPassport = new Passport('pass_100', {
        studentId,
        profileVersion: 1,
        fullName: 'Le Thi B',
        education: {
          institution: 'HCMUT',
          major: 'Computer Science',
          startYear: 2022,
          gpa: 3.8,
          gpaScale: 4,
        },
        skills: ['Python', 'AI'],
        isLookingForTeammate: false,
        isOpenForScholarship: true,
        isOpenForMentoring: false,
      });
      passports.set(studentId, completedPassport);

      const passportRepo: IPassportRepository = {
        findByStudentId: async (id) => passports.get(id) ?? null,
        save: async (p) => {
          passports.set(p.studentId, p);
        },
        update: async (p) => {
          passports.set(p.studentId, p);
        },
        saveConsent: async (c) => {
          consents.set(c.id, c);
        },
        findConsentById: async (id) => consents.get(id) ?? null,
        saveMediaAsset: async (a) => {
          mediaAssets.set(a.id, a);
        },
        updateMediaAsset: async (a) => {
          mediaAssets.set(a.id, a);
        },
        findMediaAssetById: async (id) => mediaAssets.get(id) ?? null,
        findMediaAssetsByIds: async (ids) =>
          ids.map((id) => mediaAssets.get(id)).filter((a): a is MediaAsset => Boolean(a)),
      };

      const opportunity = new Opportunity(opportunityId, {
        type: 'SCHOLARSHIP',
        title: 'Scholink Excellence Scholarship 2026',
        description: 'Full tuition scholarship for STEM students',
        organizationId: 'org_1',
        createdBy: 'usr_org_1',
        organizerName: 'Scholink Foundation',
        applyMode: 'IN_APP',
        status: 'PUBLISHED',
        registerDeadline: new Date(Date.now() + 86400000),
        timezone: 'Asia/Ho_Chi_Minh',
        ruleVersion: 1,
      });

      const opportunityRepo: IOpportunityRepository = {
        findById: async (id) => (id === opportunityId ? opportunity : null),
        findMany: async () => [opportunity],
        save: async () => undefined,
        update: async () => undefined,
      };

      const applicationRepo: IApplicationRepository = {
        findById: async (id) => applications.get(id) ?? null,
        findByOpportunityAndStudent: async (oppId, stuId) =>
          Array.from(applications.values()).find(
            (a) => a.opportunityId === oppId && a.studentId === stuId,
          ) ?? null,
        findManyByStudent: async (stuId) =>
          Array.from(applications.values()).filter((a) => a.studentId === stuId),
        findManyByOpportunity: async (oppId) =>
          Array.from(applications.values()).filter((a) => a.opportunityId === oppId),
        save: async (app) => {
          applications.set(app.id, app);
        },
        update: async (app) => {
          applications.set(app.id, app);
        },
        savePreview: async (prv) => {
          previews.set(prv.previewId, prv);
        },
        findPreviewById: async (prvId) => previews.get(prvId) ?? null,
        saveRevision: async () => undefined,
        appendEvent: async () => undefined,
      };

      mediaUseCase = new MediaUseCase(passportRepo, cryptoService);
      passportUseCase = new PassportUseCase(passportRepo, mediaUseCase, cryptoService);

      const asyncGrpcClient = {
        getService: () => ({
          getProfileSnapshot: (req: { studentId: string; attachmentIds: string[] }) =>
            new Observable((subscriber) => {
              passportUseCase
                .getProfileSnapshot(req.studentId, req.attachmentIds)
                .then((res) => {
                  subscriber.next(res);
                  subscriber.complete();
                })
                .catch((err) => subscriber.error(err));
            }),
          validateConsent: (req: any) =>
            new Observable((subscriber) => {
              passportUseCase
                .validateConsent(req)
                .then((res) => {
                  subscriber.next(res);
                  subscriber.complete();
                })
                .catch((err) => subscriber.error(err));
            }),
        }),
      };

      applicationUseCase = new ApplicationUseCase(
        applicationRepo,
        opportunityRepo,
        cryptoService,
        asyncGrpcClient as any,
      );
      applicationUseCase.onModuleInit();
    });

    it('creates immutable preview, verifies consent hash, submits, withdraws, and resubmits with revision=2', async () => {
      const uploadedAttachment = await mediaUseCase.createUploadUrl(studentId, {
        category: 'ATTACHMENT',
        fileName: 'transcript.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 120000,
      });
      await mediaUseCase.completeUpload(studentId, uploadedAttachment.assetId, {
        fileHeaderHex: '255044462d312e37',
        sampleContent: '%PDF-1.7 Official Transcript',
      });

      // Step 1: Create Preview
      const preview = await applicationUseCase.createPreview(studentId, {
        opportunityId,
        submissionId: 'sub_1',
        attachmentIds: [uploadedAttachment.assetId],
        expectedRuleVersion: 1,
      });

      expect(preview.previewId).toMatch(/^prv_/);
      expect(preview.profileVersion).toBe(1);

      // Step 2: Create Consent matching Preview
      const consent = await passportUseCase.createConsent(studentId, {
        opportunityId,
        submissionId: 'sub_1',
        previewId: preview.previewId,
        snapshotId: preview.snapshotId,
        profileVersion: preview.profileVersion,
        ruleVersion: preview.ruleVersion,
        manifestHash: preview.manifestHash,
        payloadHash: preview.payloadHash,
      });

      // Step 3: Submit Application (Revision 1)
      const submitted = await applicationUseCase.submit(studentId, {
        opportunityId,
        submissionId: 'sub_1',
        submissionType: 'INDIVIDUAL',
        previewId: preview.previewId,
        snapshotId: preview.snapshotId,
        profileVersion: preview.profileVersion,
        expectedRuleVersion: 1,
        payloadHash: preview.payloadHash,
        consentId: consent.consentId,
      });

      expect(submitted.status).toBe('SUBMITTED');
      expect(submitted.revision).toBe(1);

      // Step 4: Withdraw Application
      const withdrawn = await applicationUseCase.withdraw(submitted.applicationId, studentId);
      expect(withdrawn.status).toBe('WITHDRAWN');

      // Step 5: Resubmit Application -> increments revision to 2
      const resubmitted = await applicationUseCase.submit(studentId, {
        opportunityId,
        submissionId: 'sub_2',
        submissionType: 'INDIVIDUAL',
        previewId: preview.previewId,
        snapshotId: preview.snapshotId,
        profileVersion: preview.profileVersion,
        expectedRuleVersion: 1,
        payloadHash: preview.payloadHash,
        consentId: consent.consentId,
      });

      expect(resubmitted.applicationId).toBe(submitted.applicationId);
      expect(resubmitted.status).toBe('SUBMITTED');
      expect(resubmitted.revision).toBe(2);
    });

    it('blocks submission with SNAPSHOT_STALE if Passport is edited after Preview/Consent', async () => {
      const preview = await applicationUseCase.createPreview(studentId, {
        opportunityId,
        submissionId: 'sub_stale',
        attachmentIds: [],
        expectedRuleVersion: 1,
      });

      const consent = await passportUseCase.createConsent(studentId, {
        opportunityId,
        submissionId: 'sub_stale',
        previewId: preview.previewId,
        snapshotId: preview.snapshotId,
        profileVersion: preview.profileVersion,
        ruleVersion: preview.ruleVersion,
        manifestHash: preview.manifestHash,
        payloadHash: preview.payloadHash,
      });

      // Student modifies their Passport after creating Preview & Consent -> profileVersion becomes 2
      await passportUseCase.updateMyPassport(studentId, {
        bio: 'Updated bio after preview',
      });

      await expect(
        applicationUseCase.submit(studentId, {
          opportunityId,
          submissionId: 'sub_stale',
          submissionType: 'INDIVIDUAL',
          previewId: preview.previewId,
          snapshotId: preview.snapshotId,
          profileVersion: preview.profileVersion,
          expectedRuleVersion: 1,
          payloadHash: preview.payloadHash,
          consentId: consent.consentId,
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.SNAPSHOT_STALE,
      });
    });
  });
});
