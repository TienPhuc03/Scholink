import { of } from 'rxjs';
import { ROLES_KEY } from '@shared';
import { GatewayApplicationController } from './gateway-application.controller';

describe('GatewayApplicationController', () => {
  const build = () => {
    const service = {
      abortSubmissionIntent: jest.fn(() => of({})),
      applySnapshotRetentionDecision: jest.fn(() => of({})),
    };
    const controller = new GatewayApplicationController({ getService: () => service } as never);
    controller.onModuleInit();
    return { controller, service };
  };

  it('sends the student as the actor of an abort, so the service can check the leader', async () => {
    const { controller, service } = build();

    await controller.abortSubmissionIntent({ user: { userId: 'stu_1', role: 'STUDENT' } } as never, 'sub_1', {});

    expect(service.abortSubmissionIntent).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: 'sub_1', actorId: 'stu_1' }),
    );
  });

  it('sends no actor for an admin abort', async () => {
    const { controller, service } = build();

    await controller.abortSubmissionIntent({ user: { userId: 'adm_1', role: 'ADMIN' } } as never, 'sub_1', {});

    expect(service.abortSubmissionIntent).toHaveBeenCalledWith(expect.objectContaining({ actorId: undefined }));
  });

  it('keeps the snapshot retention decision away from students', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, GatewayApplicationController.prototype.applySnapshotRetentionDecision);

    expect(roles).toEqual(['ADMIN']);
  });
});
