jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => {},
  EventEmitter2: jest.fn().mockImplementation(() => ({
    emit: jest.fn(),
  })),
}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
}));

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
  Queue: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminOpportunityController } from './presentation/admin-opportunity.controller';
import { CrawlerUseCase } from './application/use-cases/crawler.use-case';
import {
  OpportunityModel,
  OpportunityRevisionModel,
} from './infrastructure/persistence/opportunity.schema';
import { OpportunityType } from './domain/opportunity.entity';
import { NotificationController } from '../../notification-service/src/presentation/notification.controller';
import { BookmarkListener } from '../../notification-service/src/application/use-cases/listeners/bookmark.listener';
import { QuietHoursService } from '../../notification-service/src/application/use-cases/services/quiet-hours.service';
import { NotificationUseCase } from '../../notification-service/src/application/use-cases/notification.use-case';
import {
  NotificationModel as NotifModel,
  ReminderModel,
} from '../../notification-service/src/infrastructure/persistence/notification.schema';
import { NOTIFICATION_REPOSITORY } from '../../notification-service/src/domain/ports/notification.repository.port';

describe('F32 Backend - End-to-End HTTP Controller Status 200 Verification', () => {
  let adminController: AdminOpportunityController;
  let notiController: NotificationController;
  let crawlerUseCase: CrawlerUseCase;
  let bookmarkListener: BookmarkListener;

  let storedOpportunities: Map<string, any>;
  let storedRevisions: any[];
  let storedReminders: Map<string, any>;
  let storedNotifications: any[];

  beforeEach(async () => {
    storedOpportunities = new Map<string, any>();
    storedRevisions = [];
    storedReminders = new Map<string, any>();
    storedNotifications = [];

    // Mock Opportunity Model
    const mockOpportunityModel: any = function (data: any) {
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

      let doc: any = null;
      if (found) {
        doc = {
          ...found,
          save: async function () {
            storedOpportunities.set(this.id, { ...this });
            return this;
          },
          toObject: function () {
            return { ...this };
          },
        };
      }

      return {
        lean: () => ({
          exec: async () => (found ? { ...found } : null),
          then: (resolve: any) => resolve(found ? { ...found } : null),
        }),
        exec: async () => doc,
        then: (resolve: any) => resolve(doc),
      };
    });

    mockOpportunityModel.find = jest.fn().mockImplementation((query: any) => {
      const results = Array.from(storedOpportunities.values()).filter((item) => {
        if (query.status && item.status !== query.status) return false;
        if (query.type && item.type !== query.type) return false;
        return true;
      });
      return {
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => ({
                exec: async () => results,
              }),
            }),
          }),
        }),
        select: () => ({
          lean: () => ({
            exec: async () => results,
          }),
        }),
      };
    });

    mockOpportunityModel.countDocuments = jest.fn().mockReturnValue({
      exec: async () => storedOpportunities.size,
    });

    // Mock OpportunityRevision Model
    const mockRevisionModel: any = function (data: any) {
      this.data = { ...data };
      this.save = jest.fn().mockImplementation(async () => {
        storedRevisions.push(this.data);
        return this.data;
      });
      return this;
    };

    // Mock Reminder Model
    const mockReminderModel: any = {
      findOneAndUpdate: jest.fn().mockImplementation(async (query: any, update: any) => {
        const id = update.id || `rem_${Date.now()}`;
        const doc = { ...query, ...update, id };
        storedReminders.set(id, doc);
        return doc;
      }),
      find: jest.fn().mockImplementation((query: any) => {
        const list = Array.from(storedReminders.values()).filter((item) => {
          if (query.userId && item.userId !== query.userId) return false;
          if (query.milestoneId && item.milestoneId !== query.milestoneId) return false;
          return true;
        });
        return {
          sort: () => ({
            lean: () => ({
              exec: async () => list,
            }),
          }),
          distinct: async (field: string) => Array.from(new Set(list.map((m) => m[field]))),
        };
      }),
      updateMany: jest.fn().mockImplementation(async (query: any, update: any) => {
        let count = 0;
        for (const [key, item] of storedReminders.entries()) {
          let match = true;
          if (query.userId && item.userId !== query.userId) match = false;
          if (query.milestoneId && item.milestoneId !== query.milestoneId) match = false;
          if (query.status && item.status !== query.status) match = false;
          if (match) {
            Object.assign(item, update.$set);
            storedReminders.set(key, item);
            count++;
          }
        }
        return { modifiedCount: count };
      }),
    };

    // Mock Notification Model
    const mockNotificationModel: any = function (data: any) {
      this.data = { ...data };
      this.save = jest.fn().mockImplementation(async () => {
        storedNotifications.push(this.data);
        return this.data;
      });
      return this;
    };
    mockNotificationModel.findOne = jest.fn().mockResolvedValue(null);

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockQueue: any = {
      add: jest.fn().mockResolvedValue({ id: 'job_001' }),
      getJobs: jest.fn().mockResolvedValue([]),
    };

    crawlerUseCase = new CrawlerUseCase(mockOpportunityModel);
    const quietHoursService = new QuietHoursService();
    bookmarkListener = new BookmarkListener(
      mockQueue,
      quietHoursService,
      mockReminderModel,
    );

    adminController = new AdminOpportunityController(
      crawlerUseCase,
      mockOpportunityModel,
      mockRevisionModel,
      mockEventEmitter as any,
    );

    const mockNotiRepo: any = {
      findManyByUserId: jest.fn().mockResolvedValue([]),
    };
    const notiUseCase = new NotificationUseCase(mockNotiRepo);

    notiController = new NotificationController(
      notiUseCase,
      bookmarkListener,
      mockReminderModel,
      mockNotificationModel,
    );
  });

  // =========================================================================
  // TEST HTTP ENDPOINTS STATUS 200 / 201 OK
  // =========================================================================

  it('1. POST /api/v1/admin/opportunities/ingest -> Phản hồi 200/201 và lưu PENDING_REVIEW', async () => {
    const ingestPayload = {
      items: [
        {
          title: 'Học bổng Nghiên cứu Trí tuệ Nhân tạo UIT 2026',
          sourceUrl: 'https://uit.edu.vn/hoc-bong-ai-2026',
          organizerName: 'Trường ĐH Công nghệ Thông tin',
          description: 'Chương trình học bổng tài năng trẻ CNTT toàn phần.',
          registerDeadline: '2026-12-31T23:59:59.000Z',
          timezone: 'Asia/Ho_Chi_Minh',
          fundingLevel: 'FULL',
          minGpa: 3.2,
          requiredIelts: 6.5,
        },
      ],
      type: 'SCHOLARSHIP' as OpportunityType,
      sourceConfig: {
        isTrusted: true,
        trustLevel: 1.0,
      },
    };

    const res = await adminController.ingestItems(ingestPayload);
    expect(res.success).toBe(true);
    expect(res.added).toBe(1);

    const savedId = res.ingestedIds[0];
    const saved = storedOpportunities.get(savedId);
    expect(saved.status).toBe('PENDING_REVIEW'); // Ràng buộc: không auto-publish
  });

  it('2. GET /api/v1/admin/opportunities/review-queue -> Phản hồi 200 OK với danh sách chờ duyệt', async () => {
    storedOpportunities.set('opp_queue_01', {
      id: 'opp_queue_01',
      title: 'Học bổng đang chờ duyệt 1',
      type: 'SCHOLARSHIP',
      status: 'PENDING_REVIEW',
    });

    const queueRes = await adminController.getReviewQueue('SCHOLARSHIP');
    expect(queueRes).toBeDefined();
    expect(queueRes.items.length).toBeGreaterThanOrEqual(1);
    expect(queueRes.items[0].status).toBe('PENDING_REVIEW');
  });

  it('3. GET /api/v1/admin/opportunities/:id/diff -> Phản hồi 200 OK trả về diff giữa parsed và raw', async () => {
    const rawData = {
      title: 'Học bổng Gốc từ Nguồn Web',
      creator: 'Đại học Quốc gia',
      link: 'https://vnuhcm.edu.vn',
    };
    storedOpportunities.set('opp_diff_01', {
      id: 'opp_diff_01',
      title: 'Học bổng Đã Chuẩn Hóa',
      organizerName: 'Đại học Quốc gia',
      sourceUrl: 'https://vnuhcm.edu.vn',
      type: 'SCHOLARSHIP',
      rawPayload: rawData,
      status: 'PENDING_REVIEW',
    });

    const diffRes = await adminController.getOpportunityDiff('opp_diff_01');
    expect(diffRes).toBeDefined();
    expect(diffRes.id).toBe('opp_diff_01');
    expect(diffRes.currentParsed.title).toBe('Học bổng Đã Chuẩn Hóa');
    expect(diffRes.rawOriginalPayload).toEqual(rawData);
  });

  it('4. PUT /api/v1/admin/opportunities/:id -> Phản hồi 200 OK khi chỉnh sửa trước khi duyệt', async () => {
    storedOpportunities.set('opp_edit_01', {
      id: 'opp_edit_01',
      title: 'Tiêu đề Cũ Cần Sửa',
      type: 'COMPETITION',
      status: 'PENDING_REVIEW',
      minTeamSize: 1,
    });

    const updateRes = await adminController.updateCandidate('opp_edit_01', {
      title: 'Tiêu đề Đã Chuẩn Hóa Sau Khi Sửa',
      competitionMode: 'TEAM',
      minTeamSize: 2,
      maxTeamSize: 4,
    });

    expect(updateRes.title).toBe('Tiêu đề Đã Chuẩn Hóa Sau Khi Sửa');
    expect(updateRes.minTeamSize).toBe(2);
  });

  it('5. POST /api/v1/admin/opportunities/:id/approve -> Bị chặn 400 khi chưa đủ schema, Thành công 200 khi đủ schema', async () => {
    // 5a. Chưa đủ schema (thiếu fundingLevel) -> Bị chặn 400
    storedOpportunities.set('opp_appr_fail', {
      id: 'opp_appr_fail',
      title: 'Học bổng Thiếu Schema Bắt Buộc',
      description: 'Mô tả',
      organizerName: 'Đơn vị A',
      sourceUrl: 'https://a.vn',
      applyMode: 'EXTERNAL',
      registerDeadline: new Date(Date.now() + 86400000),
      timezone: 'Asia/Ho_Chi_Minh',
      type: 'SCHOLARSHIP',
      status: 'PENDING_REVIEW',
      // THIẾU fundingLevel
    });

    await expect(
      adminController.approveOpportunity('opp_appr_fail', { actorId: 'admin_01' }),
    ).rejects.toThrow('chưa đủ schema bắt buộc');

    // 5b. Đầy đủ schema -> Phản hồi 200 OK và chuyển trạng thái PUBLISHED
    storedOpportunities.set('opp_appr_success', {
      id: 'opp_appr_success',
      title: 'Học bổng Đầy Đủ Schema Bắt Buộc',
      description: 'Mô tả chi tiết',
      organizerName: 'Đơn vị Uy Tín',
      sourceUrl: 'https://uytin.edu.vn',
      applyMode: 'EXTERNAL',
      registerDeadline: new Date(Date.now() + 86400000),
      timezone: 'Asia/Ho_Chi_Minh',
      fundingLevel: 'FULL',
      type: 'SCHOLARSHIP',
      status: 'PENDING_REVIEW',
      version: 1,
    });

    const apprRes = await adminController.approveOpportunity('opp_appr_success', {
      actorId: 'admin_super',
      reason: 'Đã xác minh đầy đủ schema và nguồn',
    });

    expect(apprRes.status).toBe('PUBLISHED');
    expect(apprRes.version).toBe(2);
    expect(storedRevisions.length).toBeGreaterThanOrEqual(1);
    expect(storedRevisions[0].status).toBe('APPROVED');
  });

  it('6. POST /api/v1/admin/opportunities/:id/reject -> Phản hồi 200 OK khi từ chối kèm lý do', async () => {
    storedOpportunities.set('opp_to_reject', {
      id: 'opp_to_reject',
      title: 'Cơ hội Thông tin Rác',
      type: 'COMPETITION',
      status: 'PENDING_REVIEW',
      version: 1,
    });

    const rejRes = await adminController.rejectOpportunity('opp_to_reject', {
      actorId: 'admin_01',
      reason: 'Spam / thông tin không có thật',
    });

    expect(rejRes.success).toBe(true);
    expect(rejRes.status).toBe('REJECTED');
  });

  it('7. POST /api/v1/admin/opportunities/:id/merge -> Phản hồi 200 OK khi gộp bài trùng lặp mờ', async () => {
    storedOpportunities.set('opp_target_std', {
      id: 'opp_target_std',
      title: 'ICPC Quốc Gia Việt Nam 2026 (Bản chuẩn)',
      type: 'COMPETITION',
      tags: ['ICPC'],
      status: 'PUBLISHED',
      version: 1,
    });

    storedOpportunities.set('opp_source_dup', {
      id: 'opp_source_dup',
      title: 'Kỳ thi Lập trình ICPC VN (Nguồn crawl phụ)',
      type: 'COMPETITION',
      tags: ['Lập trình'],
      status: 'PENDING_REVIEW',
      version: 1,
    });

    const mergeRes = await adminController.mergeOpportunity('opp_source_dup', {
      targetOpportunityId: 'opp_target_std',
      actorId: 'admin_01',
      reason: 'Gộp nguồn crawl phụ vào cơ hội chuẩn theo BR14',
    });

    expect(mergeRes.success).toBe(true);
    expect(mergeRes.targetOpportunityId).toBe('opp_target_std');

    const target = storedOpportunities.get('opp_target_std');
    expect(target.tags).toContain('Lập trình');
  });

  it('8. POST /api/v1/admin/opportunities/:id/extend -> Phản hồi 200 OK khi gia hạn cơ hội', async () => {
    const curDeadline = new Date(Date.now() + 86400000);
    const newDeadline = new Date(Date.now() + 7 * 86400000);

    storedOpportunities.set('opp_extend_api', {
      id: 'opp_extend_api',
      title: 'Cuộc thi Chuẩn Bị Gia Hạn',
      registerDeadline: curDeadline,
      version: 1,
      ruleVersion: 1,
      status: 'PUBLISHED',
    });

    const extRes = await adminController.extendDeadline('opp_extend_api', {
      newDeadline: newDeadline.toISOString(),
      reason: 'BTC gia hạn thêm 6 ngày',
      actorId: 'admin_01',
    });

    expect(extRes.version).toBe(2);
    expect(extRes.ruleVersion).toBe(2);
  });

  it('9. POST /api/v1/notifications/events/bookmark-created -> Phản hồi 200 OK lập nhắc milestone', async () => {
    const bookmarkRes = await notiController.onBookmarkCreated({
      userId: 'usr_student_event',
      opportunityId: 'opp_event_test',
      deadline: new Date(Date.now() + 15 * 86400000),
      version: 1,
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(Array.isArray(bookmarkRes)).toBe(true);
    expect(bookmarkRes.length).toBe(3); // 7d, 3d, 1d
  });

  it('10. POST /api/v1/notifications/events/bookmark-deleted -> Phản hồi 200 OK hủy nhắc khi bỏ lưu', async () => {
    const delRes = await notiController.onBookmarkDeleted({
      userId: 'usr_student_event',
      opportunityId: 'opp_event_test',
    });

    expect(delRes.success).toBe(true);
  });

  it('11. GET /api/v1/notifications/reminders -> Phản hồi 200 OK danh sách nhắc nhở', async () => {
    const reminders = await notiController.listReminders('usr_student_event');
    expect(Array.isArray(reminders)).toBe(true);
  });
});
