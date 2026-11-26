jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => {},
  EventEmitter2: jest.fn().mockImplementation(() => ({
    emit: jest.fn(),
  })),
}));

import { JwtAuthGuard, ROLES_KEY, RolesGuard } from '@shared';
import { AdminOpportunityController } from './admin-opportunity.controller';

describe('AdminOpportunityController Authorization Audit (#14)', () => {
  it('requires JwtAuthGuard, RolesGuard, and ADMIN role at controller level', () => {
    const guards = Reflect.getMetadata('__guards__', AdminOpportunityController);
    const roles = Reflect.getMetadata(ROLES_KEY, AdminOpportunityController);
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    expect(roles).toEqual(['ADMIN']);
  });

  it('uses req.user.userId instead of spoofed body.actorId on approve', async () => {
    const oppDoc: any = {
      id: 'opp_1',
      title: 'Test Opp',
      description: 'Desc',
      organizerName: 'UIT',
      type: 'SCHOLARSHIP',
      fundingLevel: 'FULL',
      applyMode: 'IN_APP',
      timezone: 'Asia/Ho_Chi_Minh',
      registerDeadline: new Date(Date.now() + 86400000),
      status: 'PENDING_REVIEW',
      version: 1,
      toObject: function () {
        return { ...this };
      },
      save: jest.fn(),
    };
    const revisionSave = jest.fn();
    const controller = new AdminOpportunityController(
      { recordPublishedItem: jest.fn() } as any,
      { findOne: jest.fn().mockResolvedValue(oppDoc) } as any,
      jest.fn(() => ({ save: revisionSave })) as any,
      { emit: jest.fn() } as any,
    );

    await controller.approveOpportunity(
      'opp_1',
      { actorId: 'spoofed_actor' },
      { user: { userId: 'real_admin_id', email: 'admin@scholink.edu.vn', role: 'ADMIN' } },
    );

    expect(oppDoc.reviewedBy).toBe('real_admin_id');
  });
});
