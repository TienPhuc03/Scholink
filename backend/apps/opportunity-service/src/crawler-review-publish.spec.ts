import { CrawlerUseCase, calculateSimilarity, normalizeText } from './application/use-cases/crawler.use-case';
import { Opportunity, OpportunityType } from './domain/opportunity.entity';
import { DomainException, ErrorCode } from '@shared';

describe('F32 Backend - Crawler Parser, Review Queue & Publish (CRAWL-03, CRAWL-04, CRAWL-05)', () => {
  let crawlerUseCase: CrawlerUseCase;
  let mockOpportunityModel: any;
  let mockRevisionModel: any;
  let storedOpportunities: Map<string, any>;
  let storedRevisions: any[];

  beforeEach(() => {
    storedOpportunities = new Map<string, any>();
    storedRevisions = [];

    mockOpportunityModel = function (data: any) {
      this.data = { ...data };
      this.save = jest.fn().mockImplementation(async () => {
        storedOpportunities.set(this.data.id, this.data);
        return this.data;
      });
      return this;
    };

    mockOpportunityModel.findOne = jest.fn().mockImplementation((query: any) => {
      let found: any = null;
      if (query.id) {
        found = storedOpportunities.get(query.id) || null;
      } else if (query.$or) {
        for (const item of storedOpportunities.values()) {
          for (const cond of query.$or) {
            if (cond.dedupKey && item.dedupKey === cond.dedupKey) found = item;
            if (cond.sourceUrl && item.sourceUrl === cond.sourceUrl) found = item;
          }
        }
      }

      const doc = found ? {
        ...found,
        save: async () => {
          storedOpportunities.set(found.id, found);
          return found;
        },
        toObject: () => found,
      } : null;

      return {
        lean: () => ({
          exec: async () => found,
          then: (resolve: any) => resolve(found),
        }),
        exec: async () => doc,
        then: (resolve: any) => resolve(doc),
      };
    });

    mockOpportunityModel.find = jest.fn().mockImplementation((query: any) => {
      const results = Array.from(storedOpportunities.values()).filter((item) => {
        if (query.type && item.type !== query.type) return false;
        if (query.status?.$in && !query.status.$in.includes(item.status)) return false;
        if (typeof query.status === 'string' && item.status !== query.status) return false;
        if (query.id?.$ne && item.id === query.id.$ne) return false;
        return true;
      });
      return {
        select: () => ({
          lean: () => ({
            exec: async () => results,
          }),
        }),
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => ({
                exec: async () => results,
              }),
            }),
          }),
        }),
      };
    });

    mockOpportunityModel.countDocuments = jest.fn().mockReturnValue({
      exec: async () => storedOpportunities.size,
    });

    mockRevisionModel = function (data: any) {
      this.data = { ...data };
      this.save = jest.fn().mockImplementation(async () => {
        storedRevisions.push(this.data);
        return this.data;
      });
      return this;
    };

    crawlerUseCase = new CrawlerUseCase(mockOpportunityModel as any);
  });

  // =========================================================================
  // 1. CRAWL-03: PARSER & SCHEMA EXTRACTION
  // =========================================================================
  describe('1. CRAWL-03: Trích xuất Schema theo loại & Section 12B Confidence', () => {
    it('Phân tích học bổng (SCHOLARSHIP) trích xuất đủ schema và lưu rawPayload đối chiếu', () => {
      const rawScholarship = {
        title: 'Học bổng Chevening Toàn phần Vietnam 2026',
        link: 'https://www.chevening.org/scholarship/vietnam',
        creator: 'UK Government',
        description: 'Tài trợ toàn phần học phí và sinh hoạt phí thạc sĩ tại Anh.',
        registerDeadline: '2026-12-31T23:59:59.000Z',
        timezone: 'Europe/London',
        fundingLevel: 'FULL',
        minGpa: 3.2,
        requiredIelts: 6.5,
      };

      const parsed = crawlerUseCase.parseOpportunity(rawScholarship, 'SCHOLARSHIP', {
        trustLevel: 1.0,
        isTrusted: true,
      });

      // Kiểm tra schema trích xuất
      expect(parsed.type).toBe('SCHOLARSHIP');
      expect(parsed.title).toBe(rawScholarship.title);
      expect(parsed.fundingLevel).toBe('FULL');
      expect(parsed.minGpa).toBe(3.2);
      expect(parsed.requiredIelts).toBe(6.5);
      expect(parsed.timezone).toBe('Europe/London');
      expect(parsed.applyMode).toBe('EXTERNAL'); // BR09

      // CRAWL-03: Giữ dữ liệu gốc cần đối chiếu
      expect(parsed.rawPayload).toEqual(rawScholarship);

      // Section 12B Confidence Breakdown
      expect(parsed.confidenceBreakdown).toBeDefined();
      expect(parsed.confidenceBreakdown.f).toBe(1.0); // Đủ 6 trường cơ bản
      expect(parsed.confidenceBreakdown.p).toBe(1.0); // Nguồn trusted
      expect(parsed.confidenceBreakdown.d).toBe(1.0); // Giờ và timezone rõ
      expect(parsed.confidenceBreakdown.k).toBe(1.0); // Đủ schema học bổng và deadline hợp lệ
      expect(parsed.confidenceScore).toBe(1.0); // C = 0.35*1 + 0.25*1 + 0.25*1 + 0.15*1 = 1.0
    });

    it('Phân tích cuộc thi (COMPETITION) trích xuất đúng competitionMode và teamSize', () => {
      const rawCompetition = {
        title: 'Cuộc thi Scholink AI Challenge Đội thi 2026',
        link: 'https://scholink.edu.vn/ai-challenge',
        organizerName: 'Scholink Community',
        description: 'Đấu trường AI dành cho các đội nhóm sinh viên.',
        registerDeadline: '2026-11-30T18:00:00.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
        competitionMode: 'TEAM',
        minTeamSize: 2,
        maxTeamSize: 4,
      };

      const parsed = crawlerUseCase.parseOpportunity(rawCompetition, 'COMPETITION');

      expect(parsed.type).toBe('COMPETITION');
      expect(parsed.competitionMode).toBe('TEAM');
      expect(parsed.minTeamSize).toBe(2);
      expect(parsed.maxTeamSize).toBe(4);
      expect(parsed.rawPayload).toEqual(rawCompetition);
    });

    it('RÀNG BUỘC CỐT LÕI: Không auto-publish trusted source, luôn đặt trạng thái PENDING_REVIEW', () => {
      const trustedItem = {
        title: 'Học bổng Danh giá từ Nguồn Trusted',
        link: 'https://official.gov/scholarship',
        organizerName: 'Bộ Giáo Dục',
        description: 'Mô tả học bổng đầy đủ chi tiết',
        registerDeadline: '2026-12-31T23:59:59.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
        fundingLevel: 'FULL',
      };

      // Dù nguồn là trusted và confidence score tối đa 1.0
      const parsed = crawlerUseCase.parseOpportunity(trustedItem, 'SCHOLARSHIP', {
        isTrusted: true,
        trustLevel: 1.0,
      });

      expect(parsed.confidenceScore).toBe(1.0);
      // Bắt buộc trạng thái vẫn là PENDING_REVIEW
      expect(parsed.status).toBe('PENDING_REVIEW');
    });

    it('Trường không chắc chắn để trống thay vì suy diễn sai (CRAWL-03)', () => {
      const ambiguousItem = {
        title: 'Học bổng không rõ tài trợ',
        link: 'https://example.com/opp',
        organizerName: 'Tổ chức XYZ',
        description: 'Không nói rõ mức tài trợ là toàn phần hay bán phần.',
      };

      const parsed = crawlerUseCase.parseOpportunity(ambiguousItem, 'SCHOLARSHIP');

      // fundingLevel để undefined vì không chắc chắn
      expect(parsed.fundingLevel).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. CRAWL-04: DEDUPLICATION & FUZZY MATCH
  // =========================================================================
  describe('2. CRAWL-04: Loại trùng BR14 qua dedupKey & Phát hiện so khớp mờ', () => {
    it('Tạo dedupKey chuẩn xác theo BR14 (type:normalizedTitle:normalizedOrganizer:year)', () => {
      const key = crawlerUseCase.generateDedupKey(
        'SCHOLARSHIP',
        'Học bổng Nghiên cứu VinAI 2026',
        'Viện Nghiên cứu Trí tuệ Nhân tạo VinAI',
        new Date('2026-12-31'),
      );

      expect(key).toBe('scholarship:hoc_bong_nghien_cuu_vinai_2026:vien_nghien_cuu_tri_tue_nhan_t:2026');
    });

    it('Loại bỏ bản ghi trùng lặp chính xác theo dedupKey hoặc sourceUrl', async () => {
      const existingOpp = {
        id: 'opp_existing_01',
        dedupKey: 'scholarship:hoc_bong_chevening:uk_gov:2026',
        sourceUrl: 'https://chevening.org/vn',
        title: 'Học bổng Chevening',
        type: 'SCHOLARSHIP',
        status: 'PUBLISHED',
      };
      storedOpportunities.set(existingOpp.id, existingOpp);

      const itemsToIngest = [
        {
          title: 'Học bổng Chevening',
          sourceUrl: 'https://chevening.org/vn',
          organizerName: 'UK Gov',
          registerDeadline: '2026-12-31',
        },
        {
          title: 'Học bổng Mới Khác',
          sourceUrl: 'https://unique.org/new',
          organizerName: 'New Org',
          registerDeadline: '2026-12-31',
        },
      ];

      const res = await crawlerUseCase.ingestItems(itemsToIngest, 'SCHOLARSHIP');

      expect(res.total).toBe(2);
      expect(res.skippedDuplicates).toBe(1); // 1 bài bị trùng
      expect(res.added).toBe(1); // 1 bài mới được thêm
    });

    it('Phát hiện trùng lặp mờ (Fuzzy Match) và gán candidateMergeIds cần Admin duyệt', async () => {
      const existingOpp = {
        id: 'opp_icpc_national',
        title: 'Kỳ thi Lập trình Sinh viên ICPC Quốc gia 2026',
        organizerName: 'Hội Tin học Việt Nam',
        type: 'COMPETITION',
        status: 'PUBLISHED',
      };
      storedOpportunities.set(existingOpp.id, existingOpp);

      // Tiêu đề nguồn thứ 2 viết gần giống nhưng có thêm chữ "Việt Nam"
      const fuzzyMatchItem = {
        title: 'Kỳ thi Lập trình Sinh viên ICPC Quốc gia Việt Nam 2026',
        sourceUrl: 'https://other-source.vn/icpc-2026',
        organizerName: 'Hội Tin học Việt Nam',
        registerDeadline: '2026-11-20',
        competitionMode: 'TEAM',
        minTeamSize: 3,
        maxTeamSize: 3,
      };

      const res = await crawlerUseCase.ingestItems([fuzzyMatchItem], 'COMPETITION');

      expect(res.added).toBe(1);
      expect(res.fuzzyFlagged).toBe(1);

      // Kiểm tra bản ghi vừa thêm có candidateMergeIds trỏ tới opp_icpc_national
      const addedDoc = storedOpportunities.get(res.ingestedIds[0]);
      expect(addedDoc.candidateMergeIds).toContain('opp_icpc_national');
    });
  });

  // =========================================================================
  // 3. CRAWL-05: REVIEW & PUBLISH VALIDATION
  // =========================================================================
  describe('3. CRAWL-05: Kiểm duyệt & Không công bố khi chưa đủ schema', () => {
    it('Chặn công bố (ném lỗi 400) khi cơ hội thiếu trường schema bắt buộc của Học bổng (fundingLevel)', () => {
      const incompleteScholarship = new Opportunity('opp_inc_01', {
        type: 'SCHOLARSHIP',
        title: 'Học bổng Chưa Rõ Tài Trợ',
        description: 'Mô tả sơ sài',
        organizerName: 'Quỹ A',
        sourceUrl: 'https://quya.org',
        applyMode: 'EXTERNAL',
        status: 'PENDING_REVIEW',
        registerDeadline: new Date(Date.now() + 86400000),
        timezone: 'Asia/Ho_Chi_Minh',
        // THIẾU fundingLevel
      });

      expect(() => incompleteScholarship.publish('admin_01', 'Duyệt thử')).toThrow(DomainException);
      try {
        incompleteScholarship.publish('admin_01', 'Duyệt thử');
      } catch (err: any) {
        expect(err.message).toContain('chưa đủ schema');
        expect(err.message).toContain('fundingLevel');
      }
    });

    it('Chặn công bố khi cuộc thi thiếu competitionMode hoặc minTeamSize', () => {
      const incompleteCompetition = new Opportunity('opp_inc_02', {
        type: 'COMPETITION',
        title: 'Cuộc thi Thiếu Quy mô Đội',
        description: 'Mô tả cuộc thi',
        organizerName: 'Đơn vị B',
        sourceUrl: 'https://donvib.org',
        applyMode: 'EXTERNAL',
        status: 'PENDING_REVIEW',
        registerDeadline: new Date(Date.now() + 86400000),
        timezone: 'Asia/Ho_Chi_Minh',
        // THIẾU competitionMode và team size
      });

      expect(() => incompleteCompetition.publish('admin_01')).toThrow(DomainException);
    });

    it('Cho phép công bố khi ĐẦY ĐỦ SCHEMA: chuyển sang PUBLISHED và tăng version', () => {
      const validScholarship = new Opportunity('opp_val_01', {
        type: 'SCHOLARSHIP',
        title: 'Học bổng Đầy đủ Schema VinAI 2026',
        description: 'Mô tả chi tiết đầy đủ học bổng',
        organizerName: 'VinAI',
        sourceUrl: 'https://vinai.io',
        applyMode: 'EXTERNAL',
        status: 'PENDING_REVIEW',
        registerDeadline: new Date(Date.now() + 86400000),
        timezone: 'Asia/Ho_Chi_Minh',
        fundingLevel: 'FULL',
        minGpa: 3.2,
        requiredIelts: 6.5,
      });

      const published = validScholarship.publish('admin_01', 'Đã kiểm tra đủ schema');

      expect(published.status).toBe('PUBLISHED');
      expect(published.version).toBe(validScholarship.version + 1);
      expect(published.props.reviewedBy).toBe('admin_01');
    });

    it('Từ chối cơ hội (Reject) kèm lý do và ghi nhận actor', () => {
      const opp = new Opportunity('opp_rej_01', {
        type: 'SCHOLARSHIP',
        title: 'Học bổng Hết Hạn hoặc Sai Thông Tin',
        description: 'Mô tả',
        organizerName: 'Nguồn Lỗi',
        sourceUrl: 'https://loi.vn',
        applyMode: 'EXTERNAL',
        status: 'PENDING_REVIEW',
        registerDeadline: new Date(Date.now() + 86400000),
        timezone: 'Asia/Ho_Chi_Minh',
        fundingLevel: 'FULL',
      });

      const rejected = opp.reject('admin_01', 'Nguồn cung cấp thông tin sai lệch');

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.props.reviewedBy).toBe('admin_01');
      expect(rejected.props.reviewReason).toBe('Nguồn cung cấp thông tin sai lệch');
    });

    it('Gia hạn hạn đăng ký cơ hội: tăng version và ruleVersion', () => {
      const currentDeadline = new Date(Date.now() + 86400000);
      const newDeadline = new Date(Date.now() + 5 * 86400000);

      const opp = new Opportunity('opp_ext_01', {
        type: 'COMPETITION',
        title: 'Hackathon Cần Gia Hạn',
        description: 'Mô tả',
        organizerName: 'ĐH CNTT',
        sourceUrl: 'https://uit.edu.vn',
        applyMode: 'EXTERNAL',
        status: 'PUBLISHED',
        registerDeadline: currentDeadline,
        timezone: 'Asia/Ho_Chi_Minh',
        competitionMode: 'TEAM',
        minTeamSize: 2,
        maxTeamSize: 4,
        ruleVersion: 1,
      });

      const extended = opp.extendDeadline(newDeadline, 'Asia/Ho_Chi_Minh', 'BTC gia hạn thêm 4 ngày');

      expect(extended.registerDeadline.getTime()).toBe(newDeadline.getTime());
      expect(extended.version).toBe(opp.version + 1);
      expect(extended.ruleVersion).toBe(opp.ruleVersion + 1);
    });
  });
});
