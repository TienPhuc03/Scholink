import { SubmissionReservation, TeamMemberConsent } from './reservation.entity';
import { DomainException, ErrorCode } from '@shared';

describe('SubmissionReservation Entity & Roster Freeze (SRS F33)', () => {
  const members = ['student_leader_01', 'student_member_02', 'student_member_03'];

  it('should initialize reservation with PENDING status and active lease', () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const reservation = new SubmissionReservation('res_001', {
      teamId: 'team_ai_001',
      competitionId: 'comp_001',
      fencingToken: 1,
      rosterVersion: 1,
      members,
      leaseExpiresAt: expiresAt,
      status: 'PENDING',
      consents: [],
    });

    expect(reservation.status).toBe('PENDING');
    expect(reservation.fencingToken).toBe(1);
    expect(reservation.members.length).toBe(3);
    expect(reservation.isExpired()).toBe(false);
    expect(reservation.hasAllConsents()).toBe(false);
  });

  it('should allow valid members to submit their Consent', () => {
    const reservation = new SubmissionReservation('res_002', {
      teamId: 'team_ai_002',
      competitionId: 'comp_001',
      fencingToken: 1,
      rosterVersion: 1,
      members,
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      status: 'PENDING',
      consents: [],
    });

    const consent1: TeamMemberConsent = {
      studentId: 'student_leader_01',
      consentId: 'consent_001',
      snapshotId: 'snap_001',
      payloadHash: 'hash_abc123',
      confirmedAt: new Date(),
    };

    reservation.addMemberConsent(consent1);
    expect(reservation.consents.length).toBe(1);
    expect(reservation.hasAllConsents()).toBe(false);
  });

  it('should reject consent from a non-member (FORBIDDEN_RESOURCE 403)', () => {
    const reservation = new SubmissionReservation('res_003', {
      teamId: 'team_ai_003',
      competitionId: 'comp_001',
      fencingToken: 1,
      rosterVersion: 1,
      members,
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      status: 'PENDING',
      consents: [],
    });

    const outsiderConsent: TeamMemberConsent = {
      studentId: 'student_outsider_99',
      consentId: 'consent_fake',
      snapshotId: 'snap_fake',
      payloadHash: 'hash_fake',
      confirmedAt: new Date(),
    };

    expect(() => reservation.addMemberConsent(outsiderConsent)).toThrow(DomainException);
  });

  it('should prevent confirmation when not all members have consented (CONSENT_MISMATCH 422)', () => {
    const reservation = new SubmissionReservation('res_004', {
      teamId: 'team_ai_004',
      competitionId: 'comp_001',
      fencingToken: 1,
      rosterVersion: 1,
      members,
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      status: 'PENDING',
      consents: [
        {
          studentId: 'student_leader_01',
          consentId: 'c1',
          snapshotId: 's1',
          payloadHash: 'h1',
          confirmedAt: new Date(),
        },
      ],
    });

    expect(() => reservation.confirm()).toThrow(DomainException);
  });

  it('should confirm reservation when all members have consented before lease expiry', () => {
    const reservation = new SubmissionReservation('res_005', {
      teamId: 'team_ai_005',
      competitionId: 'comp_001',
      fencingToken: 2,
      rosterVersion: 1,
      members,
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      status: 'PENDING',
      consents: members.map((mId, index) => ({
        studentId: mId,
        consentId: `consent_${index}`,
        snapshotId: `snap_${index}`,
        payloadHash: 'common_payload_hash_sha256',
        confirmedAt: new Date(),
      })),
    });

    expect(reservation.hasAllConsents()).toBe(true);
    reservation.confirm();
    expect(reservation.status).toBe('CONFIRMED');
  });

  it('should reject confirmation and detect expiry when lease timestamp is in the past', () => {
    const expiredReservation = new SubmissionReservation('res_006', {
      teamId: 'team_ai_006',
      competitionId: 'comp_001',
      fencingToken: 1,
      rosterVersion: 1,
      members,
      leaseExpiresAt: new Date(Date.now() - 5000), // 5 seconds in the past
      status: 'PENDING',
      consents: members.map((mId) => ({
        studentId: mId,
        consentId: `c_${mId}`,
        snapshotId: `s_${mId}`,
        payloadHash: 'hash',
        confirmedAt: new Date(),
      })),
    });

    expect(expiredReservation.isExpired()).toBe(true);
    expect(() => expiredReservation.confirm()).toThrow(DomainException);
  });
});
