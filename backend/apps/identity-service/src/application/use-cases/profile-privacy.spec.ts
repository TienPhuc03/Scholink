import { join } from 'path';
import * as protoLoader from '@grpc/proto-loader';
import { CryptoService } from '@shared';
import { PassportUseCase } from './passport.use-case';
import { Passport } from '../../domain/passport.entity';
import { User } from '../../domain/user.entity';
import { DEFAULT_FIELD_PRIVACY, resolveFieldPrivacy } from '../../domain/profile-visibility';

/**
 * FR-PROF-05: per-field visibility. Contact details are PRIVATE by default; the public view, the
 * teammates view and the application snapshot only carry what was granted.
 */
describe('Passport field privacy (FR-PROF-05)', () => {
  const studentId = 'stu_1';

  const makePassport = (fieldPrivacy?: Record<string, string>) =>
    new Passport('pp_1', {
      studentId,
      profileVersion: 4,
      fullName: 'Nguyễn Văn A',
      avatarAssetId: 'ast_avatar',
      bio: 'Yêu AI',
      regionCode: 'VN-SG',
      education: { institution: 'ĐH Bách Khoa', major: 'CNTT', startYear: 2023, gpa: 3.6, gpaScale: 4 },
      skills: ['Dart'],
      achievements: ['Giải Nhì'],
      certificates: [
        { type: 'LANGUAGE', name: 'IELTS', score: '7.0', issuedDate: new Date('2025-01-01'), status: 'SELF_DECLARED' },
      ],
      cvAssetId: 'ast_cv',
      isLookingForTeammate: true,
      isOpenForScholarship: true,
      isOpenForMentoring: false,
      fieldPrivacy,
    });

  const build = (passport: Passport) => {
    const store = { passport };
    let user = new User(studentId, {
      email: 'a@scholink.edu.vn',
      passwordHash: 'x',
      role: 'STUDENT',
      status: 'ACTIVE',
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
    });
    const passportRepo = {
      findByStudentId: jest.fn(async () => store.passport),
      update: jest.fn(async (p: Passport) => {
        store.passport = p;
      }),
    };
    const userRepo = {
      findById: jest.fn(async () => user),
      update: jest.fn(async (u: User) => {
        user = u;
      }),
    };
    const media = { verifyAssetsUsableByStudent: jest.fn(async () => undefined) };
    const useCase = new PassportUseCase(
      passportRepo as never,
      media as never,
      new CryptoService(),
      userRepo as never,
    );
    return { useCase, store, userRepo, currentUser: () => user };
  };

  it('keeps email and phone PRIVATE by default', () => {
    expect(resolveFieldPrivacy(undefined).email).toBe('PRIVATE');
    expect(resolveFieldPrivacy(undefined).phone).toBe('PRIVATE');
    expect(resolveFieldPrivacy({ email: 'PUBLIC', bogus: 'PUBLIC', phone: 'EVERYONE' })).toEqual({
      ...DEFAULT_FIELD_PRIVACY,
      email: 'PUBLIC',
    });
  });

  it('public view shows only PUBLIC fields, plus name and avatar', async () => {
    const view = await build(makePassport()).useCase.getProfileView(studentId, 'PUBLIC');

    expect(view.fullName).toBe('Nguyễn Văn A');
    expect(view.avatarAssetId).toBe('ast_avatar');
    expect(view).toEqual(expect.objectContaining({ bio: 'Yêu AI', regionCode: 'VN-SG', skills: ['Dart'] }));
    for (const hidden of ['email', 'phone', 'education', 'certificates', 'achievements', 'cvAssetId']) {
      expect(view).not.toHaveProperty(hidden);
    }
    expect(view.visibleFields).toEqual(['bio', 'regionCode', 'skills']);
  });

  it('teammates also see TEAMMATES fields but never PRIVATE ones', async () => {
    const view = await build(makePassport({ phone: 'TEAMMATES' })).useCase.getProfileView(studentId, 'TEAMMATES');

    expect(view).toEqual(
      expect.objectContaining({ phone: '0901234567', education: expect.objectContaining({ gpa: 3.6 }), cvAssetId: 'ast_cv' }),
    );
    expect(view.certificates?.[0].issuedDate).toBe('2025-01-01T00:00:00.000Z');
    expect(view).not.toHaveProperty('email');
  });

  it('changing visibility keeps the profile version, so open previews stay valid', async () => {
    const h = build(makePassport());
    const res = await h.useCase.updateFieldPrivacy(studentId, { email: 'TEAMMATES', education: 'PUBLIC' });

    expect(res.profileVersion).toBe(4);
    expect(res.fieldPrivacy).toEqual(expect.objectContaining({ email: 'TEAMMATES', education: 'PUBLIC', phone: 'PRIVATE' }));
    expect(h.store.passport.props.fieldPrivacy).toEqual(expect.objectContaining({ email: 'TEAMMATES' }));
  });

  it('rejects unknown fields and visibility values', async () => {
    await expect(
      build(makePassport()).useCase.updateFieldPrivacy(studentId, { fullName: 'PRIVATE', email: 'FRIENDS' }),
    ).rejects.toMatchObject({ statusCode: 400, details: ['fullName', 'email'] });
  });

  it('the owner sees contact details and settings; the phone is saved on the account', async () => {
    const h = build(makePassport());
    const res = await h.useCase.updateMyPassport(studentId, { phone: '0987 654 321', expectedVersion: 4 } as never);

    expect(h.currentUser().phone).toBe('0987 654 321');
    expect(res.phone).toBe('0987 654 321');
    expect(res.email).toBe('a@scholink.edu.vn');
    expect(res.fieldPrivacy.email).toBe('PRIVATE');
    expect(h.store.passport.props).not.toHaveProperty('phone');
  });

  it('the application snapshot never carries contact details or visibility settings', async () => {
    const snapshot = await build(makePassport({ email: 'PUBLIC', phone: 'PUBLIC' })).useCase.getProfileSnapshot(studentId, []);
    const data = JSON.parse(snapshot.snapshotJson) as Record<string, unknown>;

    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('phone');
    expect(data).not.toHaveProperty('fieldPrivacy');
  });

  it('declares the new RPCs and fields in identity.proto so gRPC does not drop them', () => {
    const pkg = protoLoader.loadSync(join(process.cwd(), 'libs/shared/src/protos/identity.proto'), { keepCase: true });
    const fields = (name: string) =>
      (pkg[`scholink.identity.${name}`] as { type: { field: { name: string }[] } }).type.field.map((f) => f.name);

    expect(fields('PassportResponse')).toEqual(expect.arrayContaining(['fieldPrivacy', 'email', 'phone']));
    expect(fields('UpdateMyPassportRequest')).toContain('phone');
    expect(fields('ProfileViewResponse')).toEqual(expect.arrayContaining(['visibleFields', 'education', 'certificates']));
    const service = pkg['scholink.identity.IdentityGrpcService'] as Record<string, unknown>;
    expect(Object.keys(service)).toEqual(expect.arrayContaining(['UpdateFieldPrivacy', 'GetProfileView']));
  });
});
