import { join } from 'path';
import * as protoLoader from '@grpc/proto-loader';
import { ApplicationUseCase } from './application.use-case';

/**
 * F19 (mobile "Hồ sơ của tôi"): list/detail responses carry the opportunity title and type,
 * and timeline events carry when they happened.
 */
describe('ApplicationUseCase listing (F19)', () => {
  const submittedAt = new Date('2026-11-06T03:20:00.000Z');

  const fakeApp = (id: string, opportunityId: string) => ({
    id,
    opportunityId,
    studentId: 'stu_1',
    memberIds: [] as string[],
    screeningReasons: [],
    version: 1,
    props: { opportunityId, studentId: 'stu_1', status: 'SUBMITTED', submittedAt, revision: 1 },
    isWithdrawable: () => true,
    canResubmit: () => false,
  });

  const fakeOpportunity = (title: string, type: string) => ({
    title,
    type,
    registerDeadline: new Date('2099-01-01T00:00:00.000Z'),
    isRegistrationOpen: () => true,
  });

  const opportunities: Record<string, ReturnType<typeof fakeOpportunity>> = {
    opp_a: fakeOpportunity('Học bổng A', 'SCHOLARSHIP'),
    opp_b: fakeOpportunity('Cuộc thi B', 'COMPETITION'),
  };

  const build = () => {
    const findById = jest.fn(async (id: string) => opportunities[id] ?? null);
    const applicationRepo = {
      findManyByStudent: jest.fn(async () => [
        fakeApp('app_1', 'opp_a'),
        fakeApp('app_2', 'opp_a'),
        fakeApp('app_3', 'opp_missing'),
      ]),
      findById: jest.fn(async () => fakeApp('app_1', 'opp_b')),
      findRevisionsByApplicationId: jest.fn(async () => []),
      findEventsByApplicationId: jest.fn(async () => [
        {
          id: 'evt_1',
          applicationId: 'app_1',
          actorId: 'stu_1',
          toStatus: 'SUBMITTED',
          revision: 1,
          createdAt: submittedAt,
        },
        { id: 'evt_legacy', applicationId: 'app_1', actorId: 'stu_1', toStatus: 'REVIEWING', revision: 1 },
      ]),
    };
    const useCase = new ApplicationUseCase(
      applicationRepo as never,
      { findById } as never,
      {} as never,
    );
    return { useCase, findById };
  };

  it('adds opportunity title/type to my applications and looks each opportunity up once', async () => {
    const { useCase, findById } = build();
    const items = await useCase.getMyApplications('stu_1');

    expect(items.map((i) => i.opportunityTitle)).toEqual(['Học bổng A', 'Học bổng A', '']);
    expect(items[0].opportunityType).toBe('SCHOLARSHIP');
    expect(findById).toHaveBeenCalledTimes(2);
  });

  it('adds opportunity title and event createdAt to the application detail', async () => {
    const { useCase } = build();
    const detail = await useCase.getApplicationById('app_1', 'stu_1');

    expect(detail.opportunityTitle).toBe('Cuộc thi B');
    expect(detail.opportunityType).toBe('COMPETITION');
    expect(detail.events[0].createdAt).toBe('2026-11-06T03:20:00.000Z');
    expect(detail.events[1].createdAt).toBe('');
  });

  it('declares the new fields in opportunity.proto so gRPC does not drop them', () => {
    const pkg = protoLoader.loadSync(join(process.cwd(), 'libs/shared/src/protos/opportunity.proto'), {
      keepCase: true,
    });
    const fieldNames = (typeName: string): string[] =>
      ((pkg[`scholink.opportunity.${typeName}`] as { type: { field: { name: string }[] } }).type.field).map(
        (f) => f.name,
      );

    expect(fieldNames('ApplicationSummaryMessage')).toEqual(
      expect.arrayContaining(['opportunityTitle', 'opportunityType']),
    );
    expect(fieldNames('ApplicationDetailResponse')).toEqual(
      expect.arrayContaining([
        'opportunityTitle',
        'opportunityType',
        'registrationDeadline',
        'viewerIsOwner',
        'canWithdraw',
        'canResubmit',
      ]),
    );
    expect(fieldNames('ApplicationEventMessage')).toContain('createdAt');
  });
});
