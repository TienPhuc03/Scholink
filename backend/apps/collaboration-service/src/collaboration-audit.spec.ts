import { ConfigService } from '@nestjs/config';
import { TeamUseCase } from './application/use-cases/team.use-case';
import { ChatOutboxWorkerService } from './infrastructure/workers/chat-outbox-worker.service';
import { Team } from './domain/team.entity';

describe('Collaboration Audit (#16 Batch gRPC + Pagination & #17 Outbox Claim/EMQX Env)', () => {
  it('#16 fetches member profiles in a single batch call and forwards pagination options', async () => {
    const team = new Team('t1', {
      competitionId: 'comp_1',
      name: 'Team A',
      leaderId: 's1',
      minSize: 2,
      maxSize: 4,
      status: 'FORMING',
      rosterVersion: 1,
      fencingToken: 1,
      members: [
        { studentId: 's1', role: 'LEADER', joinedAt: new Date() },
        { studentId: 's2', role: 'MEMBER', joinedAt: new Date() },
      ],
    });
    const findManyByCompetition = jest.fn().mockResolvedValue([team]);
    const getProfileViews = jest.fn().mockResolvedValue([
      { studentId: 's1', fullName: 'An', avatarUrl: 'a.png' },
      { studentId: 's2', fullName: 'Binh', avatarUrl: 'b.png' },
    ]);
    const getProfileView = jest.fn();

    const useCase = new TeamUseCase(
      { findManyByCompetition } as any,
      {} as any,
      { validateMemberProfile: jest.fn(), getProfileViews, getProfileView },
    );

    const res = await useCase.getCompetitionTeams('comp_1', { limit: 20, cursor: 't0' });
    expect(findManyByCompetition).toHaveBeenCalledWith('comp_1', { limit: 20, cursor: 't0' });
    expect(getProfileViews).toHaveBeenCalledTimes(1);
    expect(getProfileView).not.toHaveBeenCalled();
    expect(res[0].members[0].fullName).toBe('An');
  });

  it('#17 prefers atomic claimPendingOutboxEvents and avoids hardcoded admin:public', async () => {
    const claimPendingOutboxEvents = jest.fn().mockResolvedValue([
      {
        id: 'evt_1',
        aggregateType: 'CHAT',
        aggregateId: 'room_1',
        eventType: 'MessageSent',
        retryCount: 0,
        payload: { messageId: 'm1', roomId: 'room_1', senderId: 'u1', seq: 1, content: 'hi', participants: ['u1'] },
      },
    ]);
    const markOutboxPublished = jest.fn();
    const chatRepo = {
      claimPendingOutboxEvents,
      findPendingOutboxEvents: jest.fn(),
      markOutboxPublished,
      markOutboxFailed: jest.fn(),
    } as any;

    const worker = new ChatOutboxWorkerService(chatRepo, new ConfigService({}));
    const count = await worker.processOutboxBatch();
    expect(count).toBe(1);
    expect(claimPendingOutboxEvents).toHaveBeenCalledTimes(1);
    expect(markOutboxPublished).toHaveBeenCalledWith('evt_1');
  });
});
