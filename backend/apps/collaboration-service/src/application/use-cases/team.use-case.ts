import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { ITeamRepository, TEAM_REPOSITORY } from '../../domain/ports/team.repository.port';
import { IChatRepository, CHAT_REPOSITORY } from '../../domain/ports/chat.repository.port';
import { Team } from '../../domain/team.entity';
import { ChatRoom } from '../../domain/chat.entity';
import { CreateTeamDto } from '../dtos/collaboration.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class TeamUseCase {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teamRepo: ITeamRepository,
    @Inject(CHAT_REPOSITORY) private readonly chatRepo: IChatRepository,
  ) {}

  async createTeam(studentId: string, dto: CreateTeamDto) {
    const existing = await this.teamRepo.findByCompetitionAndStudent(dto.competitionId, studentId);
    if (existing && existing.status !== 'CLOSED') {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        'Bạn đã có một đội thi đang hoạt động trong cuộc thi này',
        409,
      );
    }

    const teamId = crypto.randomUUID();
    const team = new Team(teamId, {
      competitionId: dto.competitionId,
      name: dto.name,
      description: dto.description,
      leaderId: studentId,
      minSize: dto.minSize,
      maxSize: dto.maxSize,
      status: 'FORMING',
      members: [
        {
          studentId,
          role: 'LEADER',
          joinedAt: new Date(),
        },
      ],
    });

    await this.teamRepo.save(team);

    const chatRoom = new ChatRoom(crypto.randomUUID(), {
      type: 'TEAM',
      refId: teamId,
      participants: [studentId],
    });
    await this.chatRepo.saveRoom(chatRoom);

    return {
      ...team.props,
      id: team.id,
      version: team.version,
    };
  }

  async joinTeam(teamId: string, studentId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    const existing = await this.teamRepo.findByCompetitionAndStudent(team.competitionId, studentId);
    if (existing && existing.status !== 'CLOSED') {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        'Bạn đã có một đội thi đang hoạt động trong cuộc thi này',
        409,
      );
    }

    team.addMember(studentId);
    await this.teamRepo.update(team);

    return {
      teamId: team.id,
      members: team.members,
      status: team.status,
    };
  }

  async leaveTeam(teamId: string, studentId: string) {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw DomainException.notFound('Đội thi');
    }

    team.removeMember(studentId);
    await this.teamRepo.update(team);

    return {
      teamId: team.id,
      members: team.members,
      status: team.status,
    };
  }

  async getCompetitionTeams(competitionId: string) {
    const teams = await this.teamRepo.findManyByCompetition(competitionId);
    return teams.map((t) => ({ ...t.props, id: t.id }));
  }
}
