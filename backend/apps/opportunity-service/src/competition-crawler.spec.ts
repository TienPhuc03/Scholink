import {
  executeCompetitionCrawler,
  REAL_WORLD_CRAWLER_SOURCES,
  generateDedupKey,
  calculateConfidence,
  parseDeadline,
} from '../../../scripts/crawl-competitions';

describe('Real-World Competitions Crawler Suite', () => {
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeAll(() => {
    dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-11-01T00:00:00.000Z').getTime());
  });

  afterAll(() => {
    dateNowSpy.mockRestore();
  });

  describe('1. Data Integrity and Source Quality Checks', () => {
    it('phải có ít nhất 10 nguồn crawler chính thức uy tín', () => {
      expect(REAL_WORLD_CRAWLER_SOURCES.length).toBeGreaterThanOrEqual(10);
    });

    it('tất cả các nguồn crawler phải có URL hợp lệ, độ tin cậy P >= 0.85 và múi giờ IANA', () => {
      for (const entry of REAL_WORLD_CRAWLER_SOURCES) {
        const { source } = entry;
        expect(source.id).toMatch(/^src_/);
        expect(source.url).toMatch(/^https?:\/\//);
        expect(source.trustLevel).toBeGreaterThanOrEqual(0.85);
        expect(source.trustLevel).toBeLessThanOrEqual(1.0);
        expect(source.defaultTimezone).toBe('Asia/Ho_Chi_Minh');
      }
    });

    it('tổng số cuộc thi thu thập được từ các nguồn thực tế phải >= 20 cuộc thi', () => {
      const allItems = REAL_WORLD_CRAWLER_SOURCES.flatMap((s) => s.items);
      expect(allItems.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('2. Business Rules & Schema Validation (BR10, BR14, Section 12B)', () => {
    it('100% cuộc thi phải có sourceUrl chính thức, không dùng domain rác', () => {
      const allItems = REAL_WORLD_CRAWLER_SOURCES.flatMap((s) => s.items);
      for (const item of allItems) {
        expect(item.sourceUrl).toMatch(/^https:\/\/[a-z0-9\-.]+\.[a-z]{2,}/i);
        expect(item.sourceUrl).not.toContain('localhost');
        expect(item.sourceUrl).not.toContain('example.com');
      }
    });

    it('100% cuộc thi phải tuân thủ BR10 về múi giờ IANA và hạn đăng ký hợp lệ trong tương lai', () => {
      const allItems = REAL_WORLD_CRAWLER_SOURCES.flatMap((s) => s.items);
      for (const item of allItems) {
        expect(item.timezone).toBe('Asia/Ho_Chi_Minh');
        const { date: regDate } = parseDeadline(item.registerDeadline, item.timezone);
        expect(regDate).not.toBeNull();
        expect(regDate!.getTime()).toBeGreaterThan(Date.now());

        if (item.submitDeadline) {
          const { date: subDate } = parseDeadline(item.submitDeadline, item.timezone);
          expect(subDate).not.toBeNull();
          expect(subDate!.getTime()).toBeGreaterThanOrEqual(regDate!.getTime());
        }
      }
    });

    it('100% cuộc thi phải tuân thủ quy tắc thể thức thi đấu (INDIVIDUAL hoặc TEAM)', () => {
      const allItems = REAL_WORLD_CRAWLER_SOURCES.flatMap((s) => s.items);
      for (const item of allItems) {
        expect(['INDIVIDUAL', 'TEAM']).toContain(item.competitionMode);
        if (item.competitionMode === 'TEAM') {
          expect(item.minTeamSize).toBeGreaterThanOrEqual(2);
          expect(item.maxTeamSize).toBeGreaterThanOrEqual(item.minTeamSize!);
        } else {
          expect(item.minTeamSize).toBe(1);
          expect(item.maxTeamSize).toBe(1);
        }
      }
    });

    it('100% cuộc thi phải sinh dedupKey chuẩn BR14 `${type}:${norm_title}:${norm_org}:${year}`', () => {
      const allItems = REAL_WORLD_CRAWLER_SOURCES.flatMap((s) => s.items);
      for (const item of allItems) {
        const { date: regDate } = parseDeadline(item.registerDeadline, item.timezone);
        const dedupKey = generateDedupKey('COMPETITION', item.title, item.organizerName, regDate);

        expect(dedupKey).toMatch(/^competition:[a-z0-9_]+:[a-z0-9_]+:\d{4}$/);
        const parts = dedupKey.split(':');
        expect(parts[0]).toBe('competition');
        expect(Number(parts[3])).toBeGreaterThanOrEqual(2026);
      }
    });

    it('Section 12B Confidence Score bình quân phải đạt >= 95% và các chỉ số F, P, D, K hợp lệ', () => {
      let totalScore = 0;
      let count = 0;

      for (const entry of REAL_WORLD_CRAWLER_SOURCES) {
        const { source, items } = entry;
        for (const item of items) {
          const { date: regDate, isExplicitTime } = parseDeadline(item.registerDeadline, item.timezone);
          const conf = calculateConfidence(item, source.trustLevel, regDate, isExplicitTime);

          expect(conf.f).toBe(1.0); // 6/6 trường cơ bản hợp lệ
          expect(conf.p).toBe(source.trustLevel);
          expect(conf.d).toBe(1.0); // Ngày và giờ rõ ràng kèm timezone
          expect(conf.k).toBe(1.0); // Thỏa mãn ràng buộc logic hạn và thể thức
          expect(conf.score).toBeGreaterThanOrEqual(0.95);

          totalScore += conf.score;
          count++;
        }
      }

      const avgScore = totalScore / count;
      expect(avgScore).toBeGreaterThanOrEqual(0.98);
    });
  });

  describe('3. Crawler Execution Pipeline Run', () => {
    it('thực thi crawler runner phải thành công và trả về đầy đủ các trường parsedDoc', async () => {
      const result = await executeCompetitionCrawler();

      expect(result.totalSources).toBeGreaterThanOrEqual(10);
      expect(result.totalCompetitions).toBeGreaterThanOrEqual(20);
      expect(result.crawledItems.length).toBe(result.totalCompetitions);

      for (const doc of result.crawledItems) {
        expect(doc.id).toMatch(/^opp_crawl_/);
        expect(doc.dedupKey).toBeDefined();
        expect(doc.type).toBe('COMPETITION');
        expect(doc.applyMode).toBe('EXTERNAL'); // BR09
        expect(doc.rawPayload).toBeDefined(); // CRAWL-03
        expect(doc.confidenceBreakdown).toBeDefined(); // Section 12B
        expect(doc.confidenceScore).toBeGreaterThanOrEqual(0.95);
      }
    });
  });
});
