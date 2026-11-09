jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => {},
  EventEmitter2: jest.fn().mockImplementation(() => ({ emit: jest.fn() })),
}));

import { BookmarkUseCase } from './application/use-cases/bookmark.use-case';
import { isInternalOnlyPath } from '../../gateway/src/proxy.middleware';

describe('F41 fixes - Bookmark sync API (OPP-06) and gateway exposure', () => {
  let bookmarks: Array<Record<string, any>>;
  let events: string[];
  let useCase: BookmarkUseCase;
  const fetchSpy = jest.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    bookmarks = [];
    events = [];
    (global as any).fetch = fetchSpy;
    fetchSpy.mockClear();

    const bookmarkModel: any = function (this: any, data: any) {
      Object.assign(this, data);
      this._id = `oid_${bookmarks.length + 1}`;
      this.save = async () => {
        if (bookmarks.some((b) => b.userId === this.userId && b.opportunityId === this.opportunityId)) {
          const err: any = new Error('E11000');
          err.code = 11000;
          throw err;
        }
        bookmarks.push({ ...data, _id: this._id, createdAt: new Date() });
      };
    };
    bookmarkModel.findOne = jest.fn(async (q: any) =>
      bookmarks.find((b) => b.userId === q.userId && b.opportunityId === q.opportunityId) ?? null,
    );
    bookmarkModel.deleteOne = jest.fn(async (q: any) => {
      bookmarks = bookmarks.filter((b) => b._id !== q._id);
    });
    bookmarkModel.find = jest.fn((q: any) => ({
      sort: () => ({
        lean: () => ({ exec: async () => bookmarks.filter((b) => b.userId === q.userId) }),
      }),
    }));

    const opportunityModel: any = {
      findOne: jest.fn((q: any) => ({
        lean: async () =>
          q.id === 'opp_missing'
            ? null
            : { id: q.id, title: 'Cơ hội', registerDeadline: new Date(Date.now() + 864e5 * 30), version: 3 },
      })),
    };

    useCase = new BookmarkUseCase(bookmarkModel, opportunityModel, {
      emit: (name: string) => events.push(name),
    } as any);
  });

  it('target state is idempotent: repeating "bookmarked: true" keeps it saved and fires one event', async () => {
    const first = await useCase.toggleBookmark('u1', 'opp_1', true);
    const retry = await useCase.toggleBookmark('u1', 'opp_1', true);

    expect(first).toEqual({ opportunityId: 'opp_1', bookmarked: true, changed: true });
    expect(retry).toEqual({ opportunityId: 'opp_1', bookmarked: true, changed: false });
    expect(bookmarks).toHaveLength(1);
    expect(events).toEqual(['bookmark.created']);
    // Notification Service receives the real deadline/version of the opportunity.
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.version).toBe(3);
  });

  it('"bookmarked: false" removes once and is a no-op afterwards', async () => {
    await useCase.toggleBookmark('u1', 'opp_1', true);
    const removed = await useCase.toggleBookmark('u1', 'opp_1', false);
    const again = await useCase.toggleBookmark('u1', 'opp_1', false);

    expect(removed.changed).toBe(true);
    expect(again).toEqual({ opportunityId: 'opp_1', bookmarked: false, changed: false });
    expect(events).toEqual(['bookmark.created', 'bookmark.deleted']);
  });

  it('without a body the endpoint still toggles (backward compatible)', async () => {
    expect((await useCase.toggleBookmark('u1', 'opp_1')).bookmarked).toBe(true);
    expect((await useCase.toggleBookmark('u1', 'opp_1')).bookmarked).toBe(false);
  });

  it('cannot bookmark an opportunity that does not exist', async () => {
    await expect(useCase.toggleBookmark('u1', 'opp_missing', true)).rejects.toThrow();
    expect(bookmarks).toHaveLength(0);
  });

  it("lists only the caller's bookmarks", async () => {
    await useCase.toggleBookmark('u1', 'opp_1', true);
    await useCase.toggleBookmark('u1', 'opp_2', true);
    await useCase.toggleBookmark('u2', 'opp_3', true);

    const mine = await useCase.listMyBookmarks('u1');
    expect(mine.opportunityIds.sort()).toEqual(['opp_1', 'opp_2']);
  });

  it('gateway refuses service-to-service notification endpoints, keeps user endpoints', () => {
    expect(isInternalOnlyPath('/api/v1/notifications/events/bookmark-created')).toBe(true);
    expect(isInternalOnlyPath('/api/v1/notifications/transactional')).toBe(true);
    expect(isInternalOnlyPath('/api/v1/notifications/reminders?userId=x')).toBe(true);
    expect(isInternalOnlyPath('/api/v1/notifications/%65vents/opportunity-updated')).toBe(true);
    expect(isInternalOnlyPath('/API/v1//notifications/Events/x')).toBe(true);

    expect(isInternalOnlyPath('/api/v1/notifications')).toBe(false);
    expect(isInternalOnlyPath('/api/v1/notifications/preferences')).toBe(false);
    expect(isInternalOnlyPath('/api/v1/notifications/notif_1/read')).toBe(false);
  });
});
