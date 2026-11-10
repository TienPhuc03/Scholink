import { ErrorCode } from '@shared';
import { Passport } from '../../domain/passport.entity';
import { User } from '../../domain/user.entity';
import { MongoosePassportRepository } from './passport.repository';
import { MongooseUserRepository } from './user.repository';

const execResult = (value: unknown) => ({ exec: jest.fn(async () => value) });

describe('MongooseUserRepository', () => {
  const makeRepo = (models: { user?: unknown; session?: unknown }) =>
    new MongooseUserRepository(models.user as never, models.session as never, {} as never);

  describe('markSessionUsed', () => {
    it('only claims a session that is still unused and not revoked', async () => {
      const updateOne = jest.fn(() => execResult({ modifiedCount: 1 }));

      await expect(makeRepo({ session: { updateOne } }).markSessionUsed('s1')).resolves.toBe(true);

      expect(updateOne).toHaveBeenCalledWith(
        { id: { $eq: 's1' }, isUsed: { $eq: false }, isRevoked: { $eq: false } },
        { $set: { isUsed: true } },
      );
    });

    it('reports the lost race when another request claimed it first', async () => {
      const updateOne = jest.fn(() => execResult({ modifiedCount: 0 }));

      await expect(makeRepo({ session: { updateOne } }).markSessionUsed('s1')).resolves.toBe(false);
    });
  });

  describe('save', () => {
    const user = new User('u1', {
      email: 'a@uit.edu.vn',
      normalizedEmail: 'a@uit.edu.vn',
      passwordHash: 'hash',
      fullName: 'Nguyễn Văn A',
      role: 'STUDENT',
      status: 'PENDING_VERIFICATION',
    });

    it('turns a duplicate key from two concurrent registrations into EMAIL_ALREADY_EXISTS', async () => {
      const create = jest.fn(async () => {
        throw Object.assign(new Error('E11000'), { code: 11000 });
      });

      await expect(makeRepo({ user: { create } }).save(user)).rejects.toMatchObject({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
      });
    });

    it('leaves other database errors alone', async () => {
      const failure = new Error('connection lost');
      const create = jest.fn(async () => {
        throw failure;
      });

      await expect(makeRepo({ user: { create } }).save(user)).rejects.toBe(failure);
    });
  });
});

describe('MongoosePassportRepository.update', () => {
  const passport = new Passport('p1', {
    studentId: 'stu_1',
    profileVersion: 3,
    fullName: 'Nguyễn Văn A',
    isLookingForTeammate: false,
    isOpenForScholarship: false,
    isOpenForMentoring: false,
  });
  const makeRepo = (updateOne: unknown) =>
    new MongoosePassportRepository({ updateOne } as never, {} as never, {} as never);

  it('writes only over the version it read', async () => {
    const updateOne = jest.fn((_filter: unknown, _update: unknown) => execResult({ matchedCount: 1 }));

    await makeRepo(updateOne).update(passport, 2);

    expect(updateOne.mock.calls[0][0]).toEqual({ id: { $eq: 'p1' }, version: { $eq: 2 } });
  });

  it('fails with VERSION_MISMATCH when another save got there first', async () => {
    const updateOne = jest.fn(() => execResult({ matchedCount: 0 }));

    await expect(makeRepo(updateOne).update(passport, 2)).rejects.toMatchObject({
      code: ErrorCode.VERSION_MISMATCH,
    });
  });
});
