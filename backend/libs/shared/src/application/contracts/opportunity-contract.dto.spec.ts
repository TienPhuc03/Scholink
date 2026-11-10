import { SubmitApplicationDtoSchema } from './opportunity-contract.dto';

describe('SubmitApplicationDtoSchema for TEAM (FR-APP-05)', () => {
  const memberConsent = {
    studentId: 'stu_1',
    previewId: 'prv_1',
    snapshotId: 'snap_1',
    profileVersion: 1,
    payloadHash: 'a'.repeat(64),
    consentId: 'con_1',
  };
  const teamBody = {
    opportunityId: 'opp_1',
    submissionType: 'TEAM',
    teamId: 'team_1',
    submissionId: 'res_1',
    reservationId: 'res_1',
    fencingToken: 3,
    rosterVersion: 2,
    memberConsents: [memberConsent],
  };

  it('accepts a body with its reservation', () => {
    expect(SubmitApplicationDtoSchema.safeParse(teamBody).success).toBe(true);
  });

  it.each(['reservationId', 'fencingToken', 'rosterVersion'])('rejects a body without %s', (field) => {
    const { [field as keyof typeof teamBody]: _removed, ...body } = teamBody;
    const parsed = SubmitApplicationDtoSchema.safeParse(body);

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toEqual([field]);
  });
});
