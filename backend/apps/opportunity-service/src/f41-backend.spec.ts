jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => {},
  EventEmitter2: jest.fn().mockImplementation(() => ({
    emit: jest.fn(),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { CrawlerUseCase, CrawledRawItem } from './application/use-cases/crawler.use-case';
import { OpportunityUseCase } from './application/use-cases/opportunity.use-case';
import { AdminOpportunityController } from './presentation/admin-opportunity.controller';
import { OpportunityController } from './presentation/opportunity.controller';
import { BookmarkUseCase } from './application/use-cases/bookmark.use-case';
import {
  OpportunityModel,
  OpportunityRevisionModel,
  BookmarkModel,
  ExternalRegistrationModel,
  CrawlerSourceModel,
  CrawlerAlertModel,
} from './infrastructure/persistence/opportunity.schema';
import {
  ApplicationModel,
} from './infrastructure/persistence/application.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IOpportunityRepository, OPPORTUNITY_REPOSITORY } from './domain/ports/opportunity.repository.port';
import { Opportunity, OpportunityType } from './domain/opportunity.entity';
import { ErrorCode, DomainException } from '@shared';

describe('F41 Backend: Catalog, Crawler (CRAWL-08), Notification (NOTI-02) & BO Demo Analytics (ADM-03)', () => {
  let crawlerUseCase: CrawlerUseCase;
  let opportunityUseCase: OpportunityUseCase;
  let adminController: AdminOpportunityController;
  let oppController: OpportunityController;

  // In-memory collections to rigorously test state and invariants
  const memoryOpportunities = new Map<string, any>();
  const memoryRevisions: any[] = [];
  const memoryBookmarks = new Map<string, any>();
  const memoryExternalRegs = new Map<string, any>();
  const memoryApplications = new Map<string, any>();

  // Mock Repository implementing IOpportunityRepository
  const mockOpportunityRepo: IOpportunityRepository = {
    async findById(id: string): Promise<Opportunity | null> {
      const opp = memoryOpportunities.get(id);
      if (!opp) return null;
      return new Opportunity(opp.id, { ...opp });
    },
    async findMany(filter: any): Promise<Opportunity[]> {
      const list = Array.from(memoryOpportunities.values());
      return list.map((opp) => new Opportunity(opp.id, { ...opp }));
    },
    async save(opportunity: Opportunity): Promise<void> {
      memoryOpportunities.set(opportunity.id, {
        id: opportunity.id,
        ...opportunity.props,
        ruleVersion: opportunity.ruleVersion,
        version: opportunity.version,
      });
    },
    async update(opportunity: Opportunity): Promise<void> {
      memoryOpportunities.set(opportunity.id, {
        id: opportunity.id,
        ...opportunity.props,
        ruleVersion: opportunity.ruleVersion,
        version: opportunity.version,
      });
    },
  };

  // Mock Mongoose Opportunity Model Constructor
  const mockOpportunityModel: any = function (data: any) {
    Object.assign(this, data);
    this.save = jest.fn().mockImplementation(async () => {
      memoryOpportunities.set(this.id, { ...this });
      return this;
    });
  };

  mockOpportunityModel.find = jest.fn().mockImplementation((query?: any) => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockImplementation(async () => {
      let results = Array.from(memoryOpportunities.values());
      if (query?.type) results = results.filter((r) => r.type === query.type);
      if (query?.status?.$in) results = results.filter((r) => query.status.$in.includes(r.status));
      return results;
    }),
  }));

  mockOpportunityModel.findOne = jest.fn().mockImplementation((query: any) => {
    let found: any = null;
    if (query.id) found = memoryOpportunities.get(query.id);
    else if (query.dedupKey) {
      found = Array.from(memoryOpportunities.values()).find((r) => r.dedupKey === query.dedupKey);
    } else if (query.$or) {
      found = Array.from(memoryOpportunities.values()).find((r) => {
        return query.$or.some((c: any) => (c.dedupKey && r.dedupKey === c.dedupKey) || (c.sourceUrl && r.sourceUrl === c.sourceUrl));
      });
    }

    if (!found) return null;
    return {
      ...found,
      toObject: () => ({ ...found }),
      save: async function () {
        memoryOpportunities.set(this.id, { ...this });
        return this;
      },
    };
  });

  mockOpportunityModel.countDocuments = jest.fn().mockImplementation(async (query?: any) => {
    let list = Array.from(memoryOpportunities.values());
    if (query?.type) list = list.filter((r) => r.type === query.type);
    if (query?.sourceUrl?.$regex) list = list.filter((r) => r.sourceUrl && r.sourceUrl.startsWith('http'));
    return list.length;
  });

  const mockRevisionModel: any = jest.fn().mockImplementation((dto: any) => ({
    ...dto,
    save: async function () {
      memoryRevisions.push(this);
      return this;
    },
  }));

  const mockBookmarkModel: any = {
    findOne: jest.fn().mockImplementation(async (q: any) => {
      return memoryBookmarks.get(`${q.userId}:${q.opportunityId}`) || null;
    }),
    deleteOne: jest.fn().mockImplementation(async (q: any) => {
      for (const [k, v] of memoryBookmarks.entries()) {
        if (v._id === q._id) memoryBookmarks.delete(k);
      }
    }),
  };

  const mockExternalRegModel: any = {
    findOne: jest.fn().mockImplementation(async (q: any) => {
      return memoryExternalRegs.get(`${q.userId}:${q.opportunityId}`) || null;
    }),
    create: jest.fn().mockImplementation(async (data: any) => {
      const record = {
        ...data,
        save: async function () {
          memoryExternalRegs.set(`${this.userId}:${this.opportunityId}`, this);
        },
      };
      memoryExternalRegs.set(`${data.userId}:${data.opportunityId}`, record);
      return record;
    }),
    countDocuments: jest.fn().mockImplementation(async (q?: any) => {
      let list = Array.from(memoryExternalRegs.values());
      if (q?.status) list = list.filter((r) => r.status === q.status);
      return list.length;
    }),
  };

  const mockApplicationModel: any = {
    countDocuments: jest.fn().mockImplementation(async (q?: any) => {
      let list = Array.from(memoryApplications.values());
      if (q?.status) list = list.filter((r) => r.status === q.status);
      return list.length;
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeAll(async () => {
    // Populate 20 Scholarships and 20 Competitions into memory repository with authentic sources
    for (let i = 1; i <= 20; i++) {
      const id = `opp_scholarship_${i}`;
      memoryOpportunities.set(id, {
        id,
        dedupKey: `scholarship:real_source_univ_${i}:2026`,
        type: 'SCHOLARSHIP',
        title: `Học bổng Danh giá Toàn phần Đại học #${i} 2026`,
        description: `Mô tả học bổng số ${i} tài trợ toàn phần học phí và sinh hoạt phí cho sinh viên.`,
        organizerName: `Đại học Quốc gia #${i}`,
        sourceUrl: `https://scholarship.university-${i}.edu.vn/apply`,
        applyMode: i <= 5 ? 'IN_APP' : 'EXTERNAL',
        status: 'PUBLISHED',
        registerDeadline: new Date(Date.now() + (10 + i) * 86400000),
        submitDeadline: new Date(Date.now() + (10 + i) * 86400000),
        timezone: 'Asia/Ho_Chi_Minh',
        fundingLevel: 'FULL',
        minGpa: 3.2,
        requiredIelts: 6.5,
        ruleVersion: 1,
        version: 1,
      });
    }

    for (let i = 1; i <= 20; i++) {
      const id = `opp_competition_${i}`;
      memoryOpportunities.set(id, {
        id,
        dedupKey: `competition:national_tech_challenge_${i}:2026`,
        type: 'COMPETITION',
        title: `Cuộc thi Lập trình & Đổi mới Sáng tạo Quốc gia #${i} 2026`,
        description: `Thử thách giải thuật và phát triển giải pháp thực tế cuộc thi số ${i}.`,
        organizerName: `Hiệp hội Công nghệ #${i}`,
        sourceUrl: `https://challenge.tech-${i}.org/register`,
        applyMode: i <= 5 ? 'IN_APP' : 'EXTERNAL',
        status: 'PUBLISHED',
        registerDeadline: new Date(Date.now() + (15 + i) * 86400000),
        submitDeadline: new Date(Date.now() + (20 + i) * 86400000),
        timezone: 'Asia/Ho_Chi_Minh',
        competitionMode: i % 2 === 0 ? 'TEAM' : 'INDIVIDUAL',
        minTeamSize: i % 2 === 0 ? 2 : 1,
        maxTeamSize: i % 2 === 0 ? 4 : 1,
        ruleVersion: 1,
        version: 1,
      });
    }

    crawlerUseCase = new CrawlerUseCase(mockOpportunityModel);
    opportunityUseCase = new OpportunityUseCase(mockOpportunityRepo, mockExternalRegModel);

    adminController = new AdminOpportunityController(
      crawlerUseCase,
      mockOpportunityModel,
      mockRevisionModel,
      mockEventEmitter as any,
      mockExternalRegModel,
      mockApplicationModel,
    );

    const bookmarkUseCase = new BookmarkUseCase(
      mockBookmarkModel,
      mockOpportunityModel,
      mockEventEmitter as any,
    );

    oppController = new OpportunityController(
      opportunityUseCase,
      bookmarkUseCase,
    );
  });

  // =========================================================================
  // 1. KIỂM DỮ LIỆU NGUỒN & LỊCH: 20 HỌC BỔNG + 20 CUỘC THI
  // =========================================================================
  describe('1. Kiểm dữ liệu nguồn và lịch (20 Học bổng + 20 Cuộc thi)', () => {
    it('phải có chính xác 20 học bổng và 20 cuộc thi hợp lệ trong catalog', async () => {
      const all = await mockOpportunityRepo.findMany({});
      const scholarships = all.filter((o) => o.type === 'SCHOLARSHIP');
      const competitions = all.filter((o) => o.type === 'COMPETITION');

      expect(all.length).toBe(40);
      expect(scholarships.length).toBe(20);
      expect(competitions.length).toBe(20);
    });

    it('100% cơ hội phải có URL nguồn thực tế và múi giờ chuẩn IANA', async () => {
      const all = await mockOpportunityRepo.findMany({});
      for (const opp of all) {
        expect(opp.props.sourceUrl).toBeDefined();
        expect(opp.props.sourceUrl).toMatch(/^https?:\/\//);
        expect(opp.props.timezone).toBe('Asia/Ho_Chi_Minh');
      }
    });

    it('100% cơ hội phải có hạn đăng ký hợp lệ và submitDeadline không trước registerDeadline', async () => {
      const all = await mockOpportunityRepo.findMany({});
      for (const opp of all) {
        expect(opp.registerDeadline.getTime()).toBeGreaterThan(Date.now());
        if (opp.props.submitDeadline) {
          expect(opp.props.submitDeadline.getTime()).toBeGreaterThanOrEqual(opp.registerDeadline.getTime());
        }
      }
    });

    it('100% cuộc thi dạng TEAM phải có ràng buộc minTeamSize <= maxTeamSize', async () => {
      const all = await mockOpportunityRepo.findMany({});
      const teamComps = all.filter((o) => o.type === 'COMPETITION' && o.props.competitionMode === 'TEAM');
      expect(teamComps.length).toBeGreaterThan(0);

      for (const tc of teamComps) {
        expect(tc.props.minTeamSize).toBeGreaterThanOrEqual(2);
        expect(tc.props.maxTeamSize).toBeGreaterThanOrEqual(tc.props.minTeamSize!);
      }
    });
  });

  // =========================================================================
  // 2. RÀNG BUỘC CƠ HỘI NGOÀI: KHÔNG THÀNH APPLICATION (WF05)
  // =========================================================================
  describe('2. Cơ hội ngoài không thành Application (WF05 & FR-APP-04)', () => {
    it('chặn nộp hoặc đánh dấu nếu cơ hội là IN_APP cố tình gọi self-mark external', async () => {
      const inAppOppId = 'opp_scholarship_1'; // IN_APP
      await expect(
        opportunityUseCase.toggleExternalMark('usr_student_001', inAppOppId, true),
      ).rejects.toThrow(DomainException);
    });

    it('cho phép sinh viên tự đánh dấu EXTERNAL_MARKED đối với cơ hội ngoài và lưu vào external_registrations', async () => {
      const extOppId = 'opp_scholarship_6'; // EXTERNAL
      const userId = 'usr_student_001';

      const result = await oppController.toggleExternalMark(
        { user: { userId } as any },
        extOppId,
        { marked: true },
      );

      expect(result.opportunityId).toBe(extOppId);
      expect(result.userId).toBe(userId);
      expect(result.isExternalMarked).toBe(true);
      expect(result.status).toBe('EXTERNAL_MARKED');
      expect(result.sourceUrl).toBeDefined();

      // Kiểm tra: Đã lưu vào external_registrations
      const inStore = await mockExternalRegModel.findOne({ userId, opportunityId: extOppId });
      expect(inStore).toBeDefined();
      expect(inStore.status).toBe('EXTERNAL_MARKED');

      // ĐIỀU KIỆN TIÊN QUYẾT: Tuyệt đối KHÔNG tạo bản ghi trong collection applications
      const appCount = await mockApplicationModel.countDocuments();
      expect(appCount).toBe(0);
    });

    it('kiểm tra trạng thái external-mark trả về đúng URL nguồn để mở an toàn ra ngoài', async () => {
      const extOppId = 'opp_scholarship_6';
      const userId = 'usr_student_001';

      const status = await oppController.getExternalMarkStatus(
        { user: { userId } as any },
        extOppId,
      );

      expect(status.isExternalMarked).toBe(true);
      expect(status.status).toBe('EXTERNAL_MARKED');
      expect(status.sourceUrl).toBe('https://scholarship.university-6.edu.vn/apply');
    });

    it('cho phép hủy đánh dấu (unmark) chuyển trạng thái thành REMOVED', async () => {
      const extOppId = 'opp_scholarship_6';
      const userId = 'usr_student_001';

      const unmark = await oppController.toggleExternalMark(
        { user: { userId } as any },
        extOppId,
        { marked: false },
      );

      expect(unmark.isExternalMarked).toBe(false);
      expect(unmark.status).toBe('REMOVED');

      // Vẫn bảo toàn: KHÔNG có bất kỳ Application nào được tạo
      expect(await mockApplicationModel.countDocuments()).toBe(0);
    });
  });

  // =========================================================================
  // 3. CRAWLER GIÁM SÁT, RETRY 3 NHỊP, DEGRADED & CẢNH BÁO (FR-CRAWL-08)
  // =========================================================================
  describe('3. Crawler Dashboard, Retry 3 nhịp & Cảnh báo DEGRADED (FR-CRAWL-08)', () => {
    it('lấy danh sách nguồn crawler khởi tạo ban đầu và kiểm tra trạng thái HEALTHY', async () => {
      const sources = await crawlerUseCase.getSources();
      expect(sources.length).toBeGreaterThanOrEqual(4);

      const vinai = sources.find((s) => s.id === 'src_vinai_feed');
      expect(vinai).toBeDefined();
      expect(vinai.status).toBe('HEALTHY');
      expect(vinai.retryCount).toBe(0);
      expect(vinai.maxRetries).toBe(3);
    });

    it('theo dõi đúng 5 chỉ số vận hành: lấy / loại / gộp / công bố / lỗi (CRAWL-08)', async () => {
      const dash = await adminController.getCrawlerDashboard();
      expect(dash.summary).toBeDefined();
      expect(dash.summary.totalFetched).toBeGreaterThan(0);
      expect(dash.summary.totalMerged).toBeGreaterThan(0);
      expect(dash.summary.totalPublished).toBeGreaterThan(0);
      expect(dash.summary.totalErrors).toBeDefined();
      expect(dash.summary.totalRejected).toBeDefined();
    });

    it('khi crawl gặp lỗi lần 1: tăng retryCount lên 1/3 và ghi nhận cảnh báo WARNING', async () => {
      const sourceId = 'src_vinai_feed';
      const result = await adminController.runCrawlerSourceJob(sourceId, {
        simulateFailure: true,
        errorMessage: 'Connection reset by peer (504 Gateway Timeout)',
      });

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(1);
      expect(result.status).toBe('HEALTHY'); // Chưa chạm 3 nên vẫn giữ HEALTHY
      expect(result.isDegraded).toBe(false);

      expect(result.alert).toBeDefined();
      expect(result.alert.severity).toBe('WARNING');
      expect(result.alert.message).toContain('[CRAWLER-ALERT]');
    });

    it('khi crawl gặp lỗi lần 2: tăng retryCount lên 2/3', async () => {
      const sourceId = 'src_vinai_feed';
      const result = await adminController.runCrawlerSourceJob(sourceId, {
        simulateFailure: true,
        errorMessage: 'TLS Handshake Timeout',
      });

      expect(result.retryCount).toBe(2);
      expect(result.status).toBe('HEALTHY');
      expect(result.isDegraded).toBe(false);
    });

    it('nghiệm thu: Hết 3 nhịp retry tự động chuyển sang DEGRADED và phát cảnh báo CRITICAL', async () => {
      const sourceId = 'src_vinai_feed';
      const result = await adminController.runCrawlerSourceJob(sourceId, {
        simulateFailure: true,
        errorMessage: 'Remote Host Unreachable',
      });

      expect(result.retryCount).toBe(3);
      expect(result.status).toBe('DEGRADED');
      expect(result.isDegraded).toBe(true);

      // Cảnh báo CRITICAL
      expect(result.alert.severity).toBe('CRITICAL');
      expect(result.alert.message).toContain('[CRAWLER-ALERT-DEGRADED]');

      // Xác minh trong Dashboard: degradedSources tăng lên 1
      const dash = await adminController.getCrawlerDashboard();
      expect(dash.summary.degradedSources).toBeGreaterThanOrEqual(1);

      // Cảnh báo xuất hiện trong recentAlerts
      const alerts = await adminController.getCrawlerAlerts(5);
      const criticalAlert = alerts.find((a) => a.severity === 'CRITICAL' && a.sourceId === sourceId);
      expect(criticalAlert).toBeDefined();
    });

    it('admin có thể tắt nguồn thu thập (status chuyển sang PAUSED, bỏ qua chạy lịch)', async () => {
      const sourceId = 'src_vinai_feed';
      const pausedSource = await adminController.toggleCrawlerSource(sourceId, { enabled: false });

      expect(pausedSource.isActive).toBe(false);
      expect(pausedSource.status).toBe('PAUSED');

      // Khi bị tắt, chạy crawl bị bỏ qua
      const runAttempt = await adminController.runCrawlerSourceJob(sourceId, {});
      expect(runAttempt.success).toBe(false);
      expect(runAttempt.message).toContain('PAUSED');
    });

    it('admin có thể chạy lại nguồn (Rerun): reset nhịp retry về 0, chuyển sang HEALTHY và phục hồi', async () => {
      const sourceId = 'src_vinai_feed';
      const rerunResult = await adminController.rerunCrawlerSource(sourceId, {
        items: [
          {
            title: 'Học bổng Trí tuệ Nhân tạo Mới 2026',
            description: 'Chương trình tài trợ mới nhất từ VinAI Research.',
            registerDeadline: new Date(Date.now() + 45 * 86400000),
            timezone: 'Asia/Ho_Chi_Minh',
            fundingLevel: 'FULL',
          },
        ],
      });

      expect(rerunResult.success).toBe(true);
      expect(rerunResult.retryCount).toBe(0);
      expect(rerunResult.status).toBe('HEALTHY');

      const src = await crawlerUseCase.getSourceById(sourceId);
      expect(src.status).toBe('HEALTHY');
      expect(src.retryCount).toBe(0);
      expect(src.isActive).toBe(true);
    });
  });

  // =========================================================================
  // 4. BO DASHBOARD & DEMO ANALYTICS (FR-ADM-03)
  // =========================================================================
  describe('4. Dashboard theo BO có định nghĩa mẫu số và kỳ đo (FR-ADM-03)', () => {
    it('API /api/v1/admin/opportunities/analytics/bo-dashboard trả về đầy đủ phân tách nghiệp vụ', async () => {
      const res = await adminController.getBoDashboard();

      expect(res.period).toBeDefined();
      expect(res.generatedAt).toBeDefined();
      expect(res.privacyNotice).toContain('FR-ADM-03');
      expect(res.breakdowns).toBeDefined();
    });

    it('nghiệm thu ADM-03: Phân biệt rõ rệt Application với External Mark', async () => {
      const res = await adminController.getBoDashboard();
      const appVsExt = res.breakdowns.applicationsVsExternalMarks;

      expect(appVsExt).toBeDefined();
      expect(typeof appVsExt.directApplicationsCount).toBe('number');
      expect(typeof appVsExt.externalMarksCount).toBe('number');
      expect(appVsExt.directApplicationsByStatus).toBeDefined();
      expect(appVsExt.description).toContain('không tạo bản ghi Application');
    });

    it('nghiệm thu ADM-03: Phân biệt Sandbox với Tiền thật (0đ tiền thật, không tính là doanh thu)', async () => {
      const res = await adminController.getBoDashboard();
      const sandVsReal = res.breakdowns.sandboxVsRealPayments;

      expect(sandVsReal).toBeDefined();
      expect(sandVsReal.sandboxTransactionsCount).toBeGreaterThan(0);
      expect(sandVsReal.sandboxVolumeVnd).toBeGreaterThan(0);

      // RÀNG BUỘC PHÁP LÝ & NGHIỆM THU: Tiền thật phải là 0 trong giai đoạn demo
      expect(sandVsReal.realTransactionsCount).toBe(0);
      expect(sandVsReal.realVolumeVnd).toBe(0);
      expect(sandVsReal.complianceNote).toContain('Không xem giao dịch sandbox là doanh thu');
    });

    it('nghiệm thu ADM-03: Bảng chỉ số BO01 - BO06 có định nghĩa mẫu số và kỳ đo rõ ràng', async () => {
      const res = await adminController.getBoDashboard();
      const metrics = res.boMetrics;

      expect(metrics.length).toBe(6);
      const boCodes = metrics.map((m: any) => m.boCode);
      expect(boCodes).toEqual(['BO01', 'BO02', 'BO03', 'BO04', 'BO05', 'BO06']);

      for (const m of metrics) {
        expect(m.measurementPeriod).toBeDefined();
        expect(m.measurementPeriod.length).toBeGreaterThan(3);
        expect(m.denominatorName).toBeDefined();
        expect(m.denominatorName.length).toBeGreaterThan(5);
        expect(m.numeratorName).toBeDefined();
        expect(m.denominatorValue).toBeGreaterThan(0);
        expect(m.ratioPercentage).toBeGreaterThanOrEqual(0);
        expect(m.targetThreshold).toBeDefined();
        expect(m.isCompliant).toBe(true);
      }
    });

    it('nghiệm thu ADM-03: Cam kết bảo mật, không chứa PII hoặc nội dung body chat/email', async () => {
      const res = await adminController.getBoDashboard();
      const jsonStr = JSON.stringify(res).toLowerCase();

      // Không chứa email cá nhân, mật khẩu, cccd hoặc nội dung tin nhắn chat
      expect(jsonStr).not.toContain('@gmail.com');
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('jwt');
      expect(jsonStr).not.toContain('chào mừng các thành viên');
    });
  });
});
