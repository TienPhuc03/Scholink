import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import {
  CryptoService,
  DomainException,
  ErrorCode,
  sanitizeInput,
  validateEnv,
} from '@shared';
import { User } from './domain/user.entity';
import { Passport } from './domain/passport.entity';
import { Consent } from './domain/consent.entity';
import { IUserRepository, SessionRecord } from './domain/ports/user.repository.port';
import { IPassportRepository } from './domain/ports/passport.repository.port';
import { AuthUseCase } from './application/use-cases/auth.use-case';
import { PassportUseCase } from './application/use-cases/passport.use-case';
import { ApplicationUseCase } from '../../opportunity-service/src/application/use-cases/application.use-case';
import { Opportunity } from '../../opportunity-service/src/domain/opportunity.entity';
import { Application } from '../../opportunity-service/src/domain/application.entity';
import {
  IApplicationRepository,
  SubmissionPreviewRecord,
} from '../../opportunity-service/src/domain/ports/application.repository.port';
import { IOpportunityRepository } from '../../opportunity-service/src/domain/ports/opportunity.repository.port';

describe('F04 Backend — Security, Immutability & Cross-Service gRPC Invariants', () => {
  const validJwtSecret = 'test_jwt_secret_minimum_32_characters_long_123';
  const validEncryptionKey = 'test_encryption_key_min_32_chars_long_456';
  let cryptoService: CryptoService;

  beforeEach(() => {
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
    it('enforces immutable updates on User and Passport and computes 7-component score', () => {
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
      expect(updatedPassport.getMissingFields()).toHaveLength(0);
    });
  });

  describe('3. AuthUseCase — Server-Assigned Role & Refresh Token Replay Family Revocation', () => {
    let users: Map<string, User>;
    let passports: Map<string, Passport>;
    let sessions: Map<string, SessionRecord>;
    let authUseCase: AuthUseCase;

    beforeEach(() => {
      users = new Map();
      passports = new Map();
      sessions = new Map();

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
      };

      const jwtService = new JwtService({ secret: validJwtSecret });
      authUseCase = new AuthUseCase(userRepo, passportRepo, jwtService, cryptoService);
    });

    it('always assigns STUDENT role on register and revokes entire token family on refresh replay', async () => {
      const reg = await authUseCase.register({
        email: 'student@uit.edu.vn',
        password: 'StrongPassword123',
        fullName: 'Nguyen Van A',
      });

      expect(reg.role).toBe('STUDENT');
      expect(passports.has(reg.userId)).toBe(true);

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
  });

  describe('4. End-to-End Preview -> Consent -> Submit & Withdraw/Resubmit Workflow', () => {
    let passports: Map<string, Passport>;
    let consents: Map<string, Consent>;
    let previews: Map<string, SubmissionPreviewRecord>;
    let applications: Map<string, Application>;
    let passportUseCase: PassportUseCase;
    let applicationUseCase: ApplicationUseCase;
    const studentId = 'stu_100';
    const opportunityId = 'opp_100';

    beforeEach(() => {
      passports = new Map();
      consents = new Map();
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

      passportUseCase = new PassportUseCase(passportRepo, cryptoService);

      // Use direct async Observable wrapper
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
      // Step 1: Create Preview
      const preview = await applicationUseCase.createPreview(studentId, {
        opportunityId,
        submissionId: 'sub_1',
        attachmentIds: ['ast_cv_1'],
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
