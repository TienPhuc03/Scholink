import { Application, ApplicationStatus } from '../../domain/application.entity';
import { ApplicationUseCase } from './application.use-case';

/**
 * F28 (FR-APP-07): the application detail tells the app whether the viewer may withdraw or
 * resubmit, so the mobile client never re-derives deadline/ownership rules on its own.
 */
describe('ApplicationUseCase detail action flags (F28)', () => {
  const deadline = new Date('2026-12-01T16:59:59.000Z');

  const makeApp = (
    status: ApplicationStatus,
    extra: Partial<{ submissionType: 'INDIVIDUAL' | 'TEAM'; memberIds: string[] }> = {},
  ) =>
    new Application('app_1', {
      opportunityId: 'opp_1',
      studentId: 'leader_1',
      submissionType: extra.submissionType ?? 'INDIVIDUAL',
      memberIds: extra.memberIds ?? [],
      status,
      previewId: 'prv_1',
      snapshotId: 'snap_1',
      profileVersion: 1,
      payloadHash: 'h',
      consentId: 'con_1',
      submittedAt: new Date('2026-11-06T03:20:00.000Z'),
      revision: 1,
    });

  const build = (app: Application, registrationOpen: boolean | null) => {
    const opportunity =
      registrationOpen === null
        ? null
        : {
            title: 'Học bổng A',
            type: 'SCHOLARSHIP',
            registerDeadline: deadline,
            isRegistrationOpen: () => registrationOpen,
          };
    const applicationRepo = {
      findById: jest.fn(async () => app),
      findRevisionsByApplicationId: jest.fn(async () => []),
      findEventsByApplicationId: jest.fn(async () => []),
    };
    return new ApplicationUseCase(
      applicationRepo as never,
      { findById: jest.fn(async () => opportunity) } as never,
      {} as never,
    );
  };

  it('shows a team member only their own snapshot and the names of the others', async () => {
    const snapshotOf = (name: string) => ({ fullName: name, education: { gpa: 3.9 } });
    const revision = {
      id: 'rev_1',
      applicationId: 'app_1',
      revision: 1,
      snapshotJson: JSON.stringify({
        teamId: 't1',
        members: [
          { studentId: 'leader_1', profileVersion: 2, snapshot: snapshotOf('Trưởng Đội') },
          { studentId: 'member_2', profileVersion: 3, snapshot: snapshotOf('Thành Viên') },
        ],
      }),
      manifestJson: JSON.stringify([
        { studentId: 'leader_1', manifest: [{ assetId: 'ast_leader' }] },
        { studentId: 'member_2', manifest: [{ assetId: 'ast_member' }] },
      ]),
      memberSnapshots: [{ studentId: 'leader_1' }, { studentId: 'member_2' }],
      consentRefs: [{ studentId: 'leader_1' }, { studentId: 'member_2' }],
      submittedAt: new Date('2026-11-06T03:20:00.000Z'),
    };
    const app = makeApp('SUBMITTED', { submissionType: 'TEAM', memberIds: ['leader_1', 'member_2'] });
    const useCase = new ApplicationUseCase(
      {
        findById: jest.fn(async () => app),
        findRevisionsByApplicationId: jest.fn(async () => [revision]),
        findEventsByApplicationId: jest.fn(async () => []),
      } as never,
      { findById: jest.fn(async () => null) } as never,
      {} as never,
    );

    const detail = await useCase.getApplicationById('app_1', 'member_2');
    const seen = detail.revisions[0];

    expect(JSON.parse(seen.snapshotJson).members).toEqual([
      { studentId: 'leader_1', snapshotRestricted: true, snapshot: { fullName: 'Trưởng Đội' } },
      { studentId: 'member_2', profileVersion: 3, snapshot: snapshotOf('Thành Viên') },
    ]);
    expect(seen.manifestJson).not.toContain('ast_leader');
    expect(seen.memberSnapshots).toEqual([{ studentId: 'member_2' }]);
    expect(seen.consentRefs).toEqual([{ studentId: 'member_2' }]);
  });

  it('lets the owner withdraw an active application while registration is open', async () => {
    const detail = await build(makeApp('SUBMITTED'), true).getApplicationById('app_1', 'leader_1');

    expect(detail.viewerIsOwner).toBe(true);
    expect(detail.canWithdraw).toBe(true);
    expect(detail.canResubmit).toBe(false);
    expect(detail.registrationDeadline).toBe('2026-12-01T16:59:59.000Z');
  });

  it('lets the owner resubmit a withdrawn application while registration is open', async () => {
    const detail = await build(makeApp('WITHDRAWN'), true).getApplicationById('app_1', 'leader_1');

    expect(detail.canWithdraw).toBe(false);
    expect(detail.canResubmit).toBe(true);
  });

  it('allows neither action after the registration deadline', async () => {
    const submitted = await build(makeApp('SUBMITTED'), false).getApplicationById('app_1', 'leader_1');
    const withdrawn = await build(makeApp('WITHDRAWN'), false).getApplicationById('app_1', 'leader_1');

    expect(submitted.canWithdraw).toBe(false);
    expect(withdrawn.canResubmit).toBe(false);
  });

  it.each<ApplicationStatus>(['ACCEPTED', 'REJECTED', 'CANCELLED'])(
    'does not allow withdrawing a %s application',
    async (status) => {
      const detail = await build(makeApp(status), true).getApplicationById('app_1', 'leader_1');

      expect(detail.canWithdraw).toBe(false);
      expect(detail.canResubmit).toBe(false);
    },
  );

  it('lets a team member view but not act on the team application', async () => {
    const app = makeApp('SUBMITTED', { submissionType: 'TEAM', memberIds: ['leader_1', 'member_2'] });
    const detail = await build(app, true).getApplicationById('app_1', 'member_2');

    expect(detail.viewerIsOwner).toBe(false);
    expect(detail.canWithdraw).toBe(false);
    expect(detail.canResubmit).toBe(false);
  });

  it('still forbids students outside the application (FR-APP-08)', async () => {
    await expect(
      build(makeApp('SUBMITTED'), true).getApplicationById('app_1', 'stranger_9'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns empty deadline and no actions when the opportunity no longer exists', async () => {
    const detail = await build(makeApp('SUBMITTED'), null).getApplicationById('app_1', 'leader_1');

    expect(detail.registrationDeadline).toBe('');
    expect(detail.opportunityTitle).toBe('');
    expect(detail.canWithdraw).toBe(false);
  });
});
