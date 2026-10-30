import { Team } from '../team.entity';
import { JoinRequest } from '../join-request.entity';
import { SubmissionReservation } from '../reservation.entity';

export interface ActiveMembershipRecord {
  id: string;
  studentId: string;
  competitionId: string;
  teamId: string;
  role: string;
  joinedAt: Date;
}

export interface ITeamRepository {
  findById(id: string): Promise<Team | null>;
  findByCompetitionAndStudent(competitionId: string, studentId: string): Promise<Team | null>;
  findManyByCompetition(competitionId: string): Promise<Team[]>;
  save(team: Team): Promise<void>;
  update(team: Team): Promise<void>;

  // Atomic Active Memberships
  saveActiveMembership(record: ActiveMembershipRecord): Promise<void>;
  findActiveMembership(competitionId: string, studentId: string): Promise<ActiveMembershipRecord | null>;
  deleteActiveMembership(competitionId: string, studentId: string): Promise<void>;

  // Join Requests
  saveJoinRequest(request: JoinRequest): Promise<void>;
  findJoinRequestById(id: string): Promise<JoinRequest | null>;
  findPendingJoinRequest(teamId: string, applicantId: string): Promise<JoinRequest | null>;
  findJoinRequestsByTeam(teamId: string): Promise<JoinRequest[]>;
  updateJoinRequest(request: JoinRequest): Promise<void>;

  // Submission Reservations (WF07)
  saveReservation(reservation: SubmissionReservation): Promise<void>;
  findReservationById(id: string): Promise<SubmissionReservation | null>;
  findActiveReservationByTeam(teamId: string): Promise<SubmissionReservation | null>;
  findExpiredPendingReservations(): Promise<SubmissionReservation[]>;
  updateReservation(reservation: SubmissionReservation): Promise<void>;
}

export const TEAM_REPOSITORY = 'TEAM_REPOSITORY';
