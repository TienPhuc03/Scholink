import { ApplicationUseCase } from './application.use-case';

describe('ApplicationUseCase.abortSubmissionIntent authorization (F31)', () => {
  const build = (intent: { leaderId: string } | null) => {
    const abortSubmissionIntent = jest.fn(async () => ({
      submissionId: 'sub_1',
      opportunityId: 'opp_1',
      teamId: 'team_1',
      leaderId: 'leader_1',
      status: 'ABORTED',
      aborted: true,
    }));
    const useCase = new ApplicationUseCase(
      { findSubmissionIntentById: jest.fn(async () => intent), abortSubmissionIntent } as never,
      {} as never,
      {} as never,
    );
    return { useCase, abortSubmissionIntent };
  };

  it('lets the leader of the session abort it', async () => {
    const { useCase, abortSubmissionIntent } = build({ leaderId: 'leader_1' });

    await expect(useCase.abortSubmissionIntent({ submissionId: 'sub_1', actorId: 'leader_1' })).resolves.toMatchObject({
      aborted: true,
    });
    expect(abortSubmissionIntent).toHaveBeenCalledTimes(1);
  });

  it('refuses another student who knows the submissionId', async () => {
    const { useCase, abortSubmissionIntent } = build({ leaderId: 'leader_1' });

    await expect(useCase.abortSubmissionIntent({ submissionId: 'sub_1', actorId: 'stranger' })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(abortSubmissionIntent).not.toHaveBeenCalled();
  });

  it('does not let a student plant a tombstone for a session that does not exist yet', async () => {
    const { useCase, abortSubmissionIntent } = build(null);

    await expect(useCase.abortSubmissionIntent({ submissionId: 'sub_new', actorId: 'stranger' })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(abortSubmissionIntent).not.toHaveBeenCalled();
  });

  it('still lets the internal worker abort without an actor', async () => {
    const { useCase, abortSubmissionIntent } = build(null);

    await expect(useCase.abortSubmissionIntent({ submissionId: 'sub_new', reason: 'LEASE_TIMEOUT' })).resolves.toMatchObject({
      aborted: true,
    });
    expect(abortSubmissionIntent).toHaveBeenCalledTimes(1);
  });
});
