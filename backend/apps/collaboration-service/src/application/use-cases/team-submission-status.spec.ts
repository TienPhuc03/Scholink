import { TeamUseCase } from './team.use-case';
import { Team } from '../../domain/team.entity';
import { SubmissionReservation } from '../../domain/reservation.entity';

/**
 * F37 (APP-05): members' consents keep their own preview + Identity consent ids, and team members
 * can read the open submission session so the leader can build the TEAM Application.
 */
describe('TeamUseCase submission status (F37)', () => {
  const leaderId = 'stu_leader';
  const memberId = 'stu_member';

  const build = (opts: { withReservation?: boolean; expired?: boolean } = {}) => {
    const team = new Team('team_1', {
      competitionId: 'opp_comp_1',
      name: 'Đội A',
      leaderId,
      minSize: 2,
      maxSize: 4,
      status: opts.withReservation ? 'SUBMITTING' : 'ACTIVE',
      rosterVersion: 2,
      fencingToken: 1,
      currentReservationId: opts.withReservation ? 'res_1' : undefined,
      members: [
        { studentId: leaderId, role: 'LEADER', joinedAt: new Date() },
        { studentId: memberId, role: 'MEMBER', joinedAt: new Date() },
      ],
      version: 1,
    } as never);
    const reservation = new SubmissionReservation('res_1', {
      teamId: 'team_1',
      competitionId: 'opp_comp_1',
      fencingToken: 1,
      rosterVersion: 2,
      members: [leaderId, memberId],
      leaseExpiresAt: new Date(Date.now() + (opts.expired ? -1000 : 10 * 60 * 1000)),
      status: 'PENDING',
      consents: [],
    });
    const repo = {
      findById: jest.fn(async () => team),
      findActiveReservationByTeam: jest.fn(async () => (opts.withReservation ? reservation : null)),
      findReservationById: jest.fn(async () => reservation),
      updateReservation: jest.fn(async () => undefined),
    };
    return { useCase: new TeamUseCase(repo as never, {} as never), reservation };
  };

  it('stores the member preview and Identity consent with the team consent', async () => {
    const { useCase } = build({ withReservation: true });

    await useCase.submitTeamConsent('res_1', memberId, {
      snapshotId: 'snap_m',
      payloadHash: 'b'.repeat(64),
      profileVersion: 3,
      rosterVersion: 2,
      previewId: 'prv_m',
      identityConsentId: 'cns_m',
    });
    const status = await useCase.getActiveSubmission('team_1', leaderId);

    expect(status.active).toBe(true);
    expect(status.consents).toEqual([
      expect.objectContaining({ studentId: memberId, previewId: 'prv_m', identityConsentId: 'cns_m', profileVersion: 3 }),
    ]);
    expect(status.hasAllConsents).toBe(false);
    expect(status.fencingToken).toBe(1);
    expect(status.rosterVersion).toBe(2);
  });

  it('tells members when there is no open session', async () => {
    const status = await build().useCase.getActiveSubmission('team_1', memberId);

    expect(status).toEqual(expect.objectContaining({ active: false, teamStatus: 'ACTIVE', leaderId }));
  });

  it('flags an expired lease so the app can restart the session', async () => {
    const status = await build({ withReservation: true, expired: true }).useCase.getActiveSubmission('team_1', leaderId);

    expect(status.expired).toBe(true);
  });

  it('hides the session from students outside the team', async () => {
    await expect(build({ withReservation: true }).useCase.getActiveSubmission('team_1', 'stu_outsider')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

/** FR-PROF-05: teammates see each other's PUBLIC + TEAMMATES fields; outsiders get nothing. */
describe('TeamUseCase teammate profile (FR-PROF-05)', () => {
  const team = new Team('team_1', {
    competitionId: 'opp_comp_1',
    name: 'Đội A',
    leaderId: 'stu_leader',
    minSize: 2,
    maxSize: 4,
    status: 'ACTIVE',
    rosterVersion: 1,
    fencingToken: 0,
    members: [
      { studentId: 'stu_leader', role: 'LEADER', joinedAt: new Date() },
      { studentId: 'stu_member', role: 'MEMBER', joinedAt: new Date() },
    ],
    version: 1,
  } as never);

  const build = () => {
    const identity = {
      validateMemberProfile: jest.fn(),
      getProfileView: jest.fn(async (studentId: string, audience: string) => ({ studentId, audience })),
    };
    const useCase = new TeamUseCase({ findById: jest.fn(async () => team) } as never, {} as never, identity as never);
    return { useCase, identity };
  };

  it('asks Identity for the TEAMMATES view when both are in the team', async () => {
    const { useCase, identity } = build();

    await expect(useCase.getTeammateProfile('team_1', 'stu_leader', 'stu_member')).resolves.toEqual({
      studentId: 'stu_member',
      audience: 'TEAMMATES',
    });
    expect(identity.getProfileView).toHaveBeenCalledWith('stu_member', 'TEAMMATES');
  });

  it.each([
    ['viewer outside the team', 'stu_outsider', 'stu_member'],
    ['target outside the team', 'stu_leader', 'stu_outsider'],
  ])('refuses when the %s', async (_label, viewer, target) => {
    const { useCase, identity } = build();

    await expect(useCase.getTeammateProfile('team_1', viewer, target)).rejects.toMatchObject({ statusCode: 403 });
    expect(identity.getProfileView).not.toHaveBeenCalled();
  });
});
