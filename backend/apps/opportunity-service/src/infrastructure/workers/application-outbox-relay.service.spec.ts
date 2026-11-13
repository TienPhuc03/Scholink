import { ConfigService } from '@nestjs/config';
import { ApplicationOutboxRelayService } from './application-outbox-relay.service';

describe('ApplicationOutboxRelayService (Mục 28: outbox → inbox)', () => {
  const build = () => {
    const sent: Array<Record<string, unknown>> = [];
    const relay = new ApplicationOutboxRelayService({} as any, new ConfigService());
    relay.useSender(async (body) => void sent.push(body));
    return { relay, sent };
  };

  const base = {
    aggregateId: 'app_1',
    correlationId: 'sub_1',
    occurredAt: new Date(),
    attempts: 0,
  };

  it('notifies the student of an individual submission with a dedup key per event', async () => {
    const { relay, sent } = build();
    await relay.handlers['application.submitted']({
      ...base,
      eventId: 'out_1',
      type: 'application.submitted',
      data: { applicationId: 'app_1', studentId: 'stu_1', submissionType: 'INDIVIDUAL' },
    });

    expect(sent).toEqual([
      expect.objectContaining({
        userId: 'stu_1',
        businessKey: 'application.submitted:out_1',
        type: 'APPLICATION_SUBMITTED',
        refUrl: '/applications/app_1',
      }),
    ]);
  });

  it('notifies every team member once, leader included', async () => {
    const { relay, sent } = build();
    await relay.handlers['application.submitted']({
      ...base,
      eventId: 'out_2',
      type: 'application.submitted',
      data: { applicationId: 'app_2', studentId: 'stu_1', memberIds: ['stu_1', 'stu_2'], submissionType: 'TEAM' },
    });

    expect(sent.map((s) => s.userId)).toEqual(['stu_1', 'stu_2']);
  });

  it('a failed send rejects so the relay retries the event', async () => {
    const { relay } = build();
    relay.useSender(async () => Promise.reject(new Error('HTTP 503')));
    await expect(
      relay.handlers['application.withdrawn']({
        ...base,
        eventId: 'out_3',
        type: 'application.withdrawn',
        data: { applicationId: 'app_1', studentId: 'stu_1' },
      }),
    ).rejects.toThrow('HTTP 503');
  });
});
