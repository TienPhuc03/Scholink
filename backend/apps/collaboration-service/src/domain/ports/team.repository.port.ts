import { Team } from '../team.entity';

export interface ITeamRepository {
  findById(id: string): Promise<Team | null>;
  findByCompetitionAndStudent(competitionId: string, studentId: string): Promise<Team | null>;
  findManyByCompetition(competitionId: string): Promise<Team[]>;
  save(team: Team): Promise<void>;
  update(team: Team): Promise<void>;
}

export const TEAM_REPOSITORY = 'TEAM_REPOSITORY';
