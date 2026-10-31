import { Team } from './team.entity';
import { DomainException, ErrorCode } from '@shared';

describe('Team Entity & Concurrency Invariant Tests (SCHOL-32)', () => {
  const createTestTeam = (maxSize = 3, minSize = 2) => {
    return new Team('team_123', {
      competitionId: 'comp_scholink_2026',
      name: 'BK AI Innovators',
      description: 'Research team',
      leaderId: 'student_leader',
      minSize,
      maxSize,
      status: 'FORMING',
      rosterVersion: 1,
      fencingToken: 0,
      members: [
        {
          studentId: 'student_leader',
          role: 'LEADER',
          joinedAt: new Date(),
        },
      ],
    });
  };

  describe('Leader slot and membership invariants', () => {
    it('leader must automatically occupy the first slot on team creation', () => {
      const team = createTestTeam(3);
      expect(team.members).toHaveLength(1);
      expect(team.members[0].studentId).toBe('student_leader');
      expect(team.members[0].role).toBe('LEADER');
      expect(team.leaderId).toBe('student_leader');
    });

    it('should reject adding member when team has reached maxSize (Slot Full)', () => {
      const team = createTestTeam(2); // leader + 1 slot left
      team.addMember('student_member_1');
      expect(team.members).toHaveLength(2);

      // Attempting to add 3rd member to a maxSize=2 team
      expect(() => team.addMember('student_member_2')).toThrow(DomainException);
      try {
        team.addMember('student_member_2');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.SLOT_FULL);
        expect(err.statusCode).toBe(409);
      }
    });

    it('should increment rosterVersion when member is added or removed', () => {
      const team = createTestTeam(4);
      expect(team.rosterVersion).toBe(1);

      team.addMember('student_member_1');
      expect(team.rosterVersion).toBe(2);

      team.removeMember('student_member_1');
      expect(team.rosterVersion).toBe(3);
    });

    it('should reject adding already existing member', () => {
      const team = createTestTeam(4);
      expect(() => team.addMember('student_leader')).toThrow(DomainException);
    });
  });

  describe('Roster Freeze & Submission States Protection (SCHOL-32 & F33)', () => {
    it('should prevent adding or removing members when team is in SUBMITTING status', () => {
      const team = createTestTeam(3);
      team.addMember('student_member_1');

      // Start submission freeze
      team.prepareSubmission('res_freeze_1');
      expect(team.status).toBe('SUBMITTING');
      expect(team.fencingToken).toBe(1);

      // Mutating members must be blocked
      expect(() => team.addMember('student_member_2')).toThrow(DomainException);
      expect(() => team.removeMember('student_member_1')).toThrow(DomainException);
    });

    it('should prevent transferring leadership when team is in SUBMITTING status', () => {
      const team = createTestTeam(3);
      team.addMember('student_member_1');
      team.prepareSubmission('res_freeze_1');

      expect(() => team.transferLeader('student_member_1', 'student_leader')).toThrow(DomainException);
    });

    it('should allow leadership transfer when team is in FORMING status by current leader only', () => {
      const team = createTestTeam(3);
      team.addMember('student_member_1');

      // Non-leader attempts transfer -> reject
      expect(() => team.transferLeader('student_member_1', 'attacker_id')).toThrow(DomainException);

      // Current leader transfers -> succeed
      team.transferLeader('student_member_1', 'student_leader');
      expect(team.leaderId).toBe('student_member_1');
      expect(team.members.find((m) => m.studentId === 'student_member_1')?.role).toBe('LEADER');
      expect(team.members.find((m) => m.studentId === 'student_leader')?.role).toBe('MEMBER');
    });

    it('should rollback to FORMING and unfreeze roster when submission is aborted', () => {
      const team = createTestTeam(3);
      team.addMember('student_member_1');
      team.prepareSubmission('res_freeze_1');
      expect(team.status).toBe('SUBMITTING');

      team.abortSubmission('res_freeze_1');
      expect(team.status).toBe('ACTIVE');
      expect(team.currentReservationId).toBeUndefined();

      // Now adding member is allowed again
      team.addMember('student_member_2');
      expect(team.members).toHaveLength(3);
    });
  });
});
