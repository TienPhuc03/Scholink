jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => {},
  EventEmitter2: jest.fn().mockImplementation(() => ({ emit: jest.fn() })),
}));

import { PaginationHelper } from '@shared';
import { MongooseOpportunityRepository } from './infrastructure/persistence/opportunity.repository';
import { OpportunityUseCase } from './application/use-cases/opportunity.use-case';
import { CrawlerUseCase, parseSourceDeadline } from './application/use-cases/crawler.use-case';
import { AdminOpportunityController } from './presentation/admin-opportunity.controller';
import { fromGrpcOpportunity } from '../../gateway/src/controllers/gateway-opportunity.controller';

/** Mongo-like evaluation of the small query subset findMany builds. */
function evalCond(doc: any, cond: any): boolean {
  return Object.entries(cond).every(([key, v]: [string, any]) => {
    if (key === '$and') return v.every((c: any) => evalCond(doc, c));
    if (key === '$or') return v.some((c: any) => evalCond(doc, c));
    const value = doc[key];
    if (v instanceof Date) return value instanceof Date && value.getTime() === v.getTime();
    if (v && typeof v === 'object') {
      if ('$eq' in v) return value === v.$eq;
      if ('$gt' in v) return v.$gt instanceof Date ? value.getTime() > v.$gt.getTime() : value > v.$gt;
      if ('$regex' in v) {
        const re = new RegExp(v.$regex, v.$options);
        return Array.isArray(value) ? value.some((x) => re.test(x)) : re.test(value ?? '');
      }
    }
    return value === v;
  });
}

function fakeModel(docs: any[]) {
  return {
    find: (q: any) => {
      let rows = docs.filter((d) => evalCond(d, q));
      return {
        sort: () => ({
          limit: (n: number) => ({
            lean: () => ({
              exec: async () => {
                rows = rows.sort(
                  (a, b) => a.registerDeadline.getTime() - b.registerDeadline.getTime() || a.id.localeCompare(b.id),
                );
                return rows.slice(0, n);
              },
            }),
          }),
        }),
      };
    },
  };
}

const day = 86_400_000;
function doc(id: string, inDays: number, extra: Record<string, any> = {}) {
  return {
    id,
    type: 'SCHOLARSHIP',
    title: `Học bổng ${id}`,
    description: 'Mô tả',
    organizerName: 'Đơn vị',
    applyMode: 'IN_APP',
    status: 'PUBLISHED',
    registerDeadline: new Date(Date.now() + inDays * day),
    timezone: 'Asia/Ho_Chi_Minh',
    tags: [],
    version: 1,
    ...extra,
  };
}

describe('Catalog paging & crawler fixes (F05/F14/F32/F41)', () => {
  it('pages through the whole catalog with the cursor: no repeats, no gaps', async () => {
    // Two items share a deadline to exercise the (deadline, id) tie-break.
    const docs = [doc('a', 3), doc('b', 5), doc('c', 5), doc('d', 9), doc('e', 12)];
    docs[2].registerDeadline = docs[1].registerDeadline;
    const useCase = new OpportunityUseCase(new MongooseOpportunityRepository(fakeModel(docs) as any));

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await useCase.list({ limit: 2, cursor, includeClosed: false } as any);
      seen.push(...page.items.map((x: any) => x.id));
      if (!page.hasMore) break;
      cursor = page.nextCursor ?? undefined;
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('hides closed opportunities by default (BR11: closed at the deadline instant)', async () => {
    const docs = [doc('old', -1), doc('open', 2)];
    const useCase = new OpportunityUseCase(new MongooseOpportunityRepository(fakeModel(docs) as any));

    expect((await useCase.list({ limit: 10 } as any)).items.map((x: any) => x.id)).toEqual(['open']);
    expect((await useCase.list({ limit: 10, includeClosed: true } as any)).items.map((x: any) => x.id)).toEqual([
      'old',
      'open',
    ]);
  });

  it('keyword also matches organizer and tags', async () => {
    const docs = [doc('x', 3, { organizerName: 'VinAI Research' }), doc('y', 4, { tags: ['ai'] }), doc('z', 5)];
    const useCase = new OpportunityUseCase(new MongooseOpportunityRepository(fakeModel(docs) as any));
    expect((await useCase.list({ limit: 10, keyword: 'vinai' } as any)).items.map((x: any) => x.id)).toEqual(['x']);
    expect((await useCase.list({ limit: 10, keyword: 'AI' } as any)).items.map((x: any) => x.id)).toEqual(['x', 'y']);
  });

  it('a garbage cursor is ignored, not a crash', async () => {
    const useCase = new OpportunityUseCase(new MongooseOpportunityRepository(fakeModel([doc('a', 3)]) as any));
    const page = await useCase.list({ limit: 10, cursor: PaginationHelper.encodeCursor({ nope: 1 }) } as any);
    expect(page.items).toHaveLength(1);
  });

  it('gateway restores eligibility rules sent as JSON over gRPC', () => {
    const out = fromGrpcOpportunity({
      id: 'o',
      eligibilityRulesJson: JSON.stringify([{ fieldKey: 'gpa', operator: 'GTE', value: 3.2 }]),
    });
    expect(out.eligibilityRules).toEqual([{ fieldKey: 'gpa', operator: 'GTE', value: 3.2 }]);
    expect(out.eligibilityRulesJson).toBeUndefined();
    expect(fromGrpcOpportunity({ id: 'o', eligibilityRulesJson: '{bad' }).eligibilityRules).toEqual([]);
    expect(
      OpportunityUseCase.toGrpcMessage({ id: 'o', eligibilityRules: [{ fieldKey: 'x' }] }).eligibilityRulesJson,
    ).toBe('[{"fieldKey":"x"}]');
  });

  describe('crawler deadlines (CRAWL-03: thiếu ngày không đoán, BR10)', () => {
    it('a date without time closes at 23:59:59 in the SOURCE timezone', () => {
      const vn = parseSourceDeadline('2026-12-31', 'Asia/Ho_Chi_Minh').date!;
      expect(vn.toISOString()).toBe('2026-12-31T16:59:59.999Z');
      const ny = parseSourceDeadline('2026-12-31', 'America/New_York').date!;
      expect(ny.toISOString()).toBe('2027-01-01T04:59:59.999Z');
    });

    it('a time without offset is read in the source timezone; with offset it is kept', () => {
      expect(parseSourceDeadline('2026-12-31 17:00', 'Asia/Ho_Chi_Minh').date!.toISOString()).toBe(
        '2026-12-31T10:00:00.000Z',
      );
      expect(parseSourceDeadline('2026-12-31T17:00:00Z', 'Asia/Tokyo').date!.toISOString()).toBe(
        '2026-12-31T17:00:00.000Z',
      );
    });

    it('no deadline in the source stays empty and is flagged for the Admin; RSS pubDate is not a deadline', () => {
      const crawler = new CrawlerUseCase({} as any);
      const parsed = crawler.parseOpportunity(
        { title: 'Học bổng không ghi hạn', link: 'https://x.edu/a', pubDate: 'Mon, 02 Nov 2026 08:00:00 GMT' },
        'SCHOLARSHIP',
      );
      expect(parsed.registerDeadline).toBeUndefined();
      expect(parsed.status).toBe('PENDING_REVIEW');
      expect(parsed.reviewReason).toContain('không tự đoán');
      expect(parsed.confidenceBreakdown.d).toBe(0);
    });
  });

  describe('approve guardrails & per-source counters (CRAWL-05/08)', () => {
    function controllerWith(opp: any, crawler: any) {
      const opportunityModel: any = { findOne: jest.fn(async () => opp) };
      const revisionModel: any = function (this: any, d: any) {
        Object.assign(this, d);
        this.save = async () => this;
      };
      return new AdminOpportunityController(crawler, opportunityModel, revisionModel, { emit: jest.fn() } as any);
    }

    function pending(extra: Record<string, any>) {
      return {
        id: 'opp_c1',
        type: 'SCHOLARSHIP',
        title: 'Học bổng crawl',
        description: 'Mô tả',
        organizerName: 'Đơn vị',
        applyMode: 'EXTERNAL',
        sourceUrl: 'https://x.edu/a',
        timezone: 'Asia/Ho_Chi_Minh',
        fundingLevel: 'FULL',
        status: 'PENDING_REVIEW',
        version: 1,
        crawlerSourceId: 'src_vinai_feed',
        save: jest.fn(async () => undefined),
        toObject() {
          return { ...this };
        },
        ...extra,
      };
    }

    beforeEach(() => {
      (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    });

    it('refuses to publish without a deadline or with a deadline already past', async () => {
      const crawler = new CrawlerUseCase({} as any);
      await expect(controllerWith(pending({}), crawler).approveOpportunity('opp_c1')).rejects.toThrow('registerDeadline');
      await expect(
        controllerWith(pending({ registerDeadline: new Date(Date.now() - 1000) }), crawler).approveOpportunity('opp_c1'),
      ).rejects.toThrow('đã qua hạn');
    });

    it('publishing counts on the crawler source that produced the item', async () => {
      const crawler = new CrawlerUseCase({} as any);
      const before = (await crawler.getSourceById('src_vinai_feed')).totalPublished;
      const opp = pending({ registerDeadline: new Date(Date.now() + 10 * day) });

      await controllerWith(opp, crawler).approveOpportunity('opp_c1');

      expect(opp.status).toBe('PUBLISHED');
      expect((await crawler.getSourceById('src_vinai_feed')).totalPublished).toBe(before + 1);
    });
  });
});
