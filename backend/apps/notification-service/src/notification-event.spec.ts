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

import { BookmarkListener } from './application/use-cases/listeners/bookmark.listener';
import { QuietHoursService } from './application/use-cases/services/quiet-hours.service';
import { ReminderWorker } from './application/use-cases/workers/reminder.worker';
import moment = require('moment-timezone');

describe('F32 Backend - Notification Event Integration & Reminders (NOTI-02)', () => {
  let bookmarkListener: BookmarkListener;
  let quietHoursService: QuietHoursService;
  let reminderWorker: ReminderWorker;

  let mockReminderQueue: any;
  let mockReminderModel: any;
  let mockNotificationModel: any;
  let mockConfigService: any;

  let storedReminders: Map<string, any>;
  let storedNotifications: any[];
  let queuedJobs: any[];

  beforeEach(() => {
    storedReminders = new Map<string, any>();
    storedNotifications = [];
    queuedJobs = [];

    // Mock BullMQ Queue
    mockReminderQueue = {
      add: jest.fn().mockImplementation(async (name: string, data: any, opts: any) => {
        queuedJobs.push({ name, data, opts });
        return { id: opts.jobId, data };
      }),
      getJobs: jest.fn().mockImplementation(async () => {
        return queuedJobs.map((j) => ({
          id: j.opts.jobId,
          data: j.data,
          remove: async () => {
            queuedJobs = queuedJobs.filter((x) => x.opts.jobId !== j.opts.jobId);
          },
        }));
      }),
      getJob: jest.fn().mockImplementation(async (jobId: string) => {
        const found = queuedJobs.find((j) => j.opts.jobId === jobId);
        if (!found) return null;
        return {
          id: found.opts.jobId,
          data: found.data,
          remove: async () => {
            queuedJobs = queuedJobs.filter((x) => x.opts.jobId !== jobId);
          },
        };
      }),
    };

    // Mock MongoDB ReminderModel
    mockReminderModel = {
      findOneAndUpdate: jest.fn().mockImplementation(async (query: any, update: any) => {
        const id = update.id || `rem_${Date.now()}`;
        const doc = { ...query, ...update, id };
        storedReminders.set(id, doc);
        return doc;
      }),
      findOne: jest.fn().mockImplementation((query: any) => {
        for (const item of storedReminders.values()) {
          let match = true;
          if (query.userId && item.userId !== query.userId) match = false;
          if (query.milestoneId && item.milestoneId !== query.milestoneId) match = false;
          if (query.deadlineVersion && item.deadlineVersion !== query.deadlineVersion) match = false;
          if (query.deadlineVersion?.$gt && item.deadlineVersion <= query.deadlineVersion.$gt) match = false;
          if (match) {
            return {
              ...item,
              save: async () => {
                storedReminders.set(item.id, item);
                return item;
              },
            };
          }
        }
        return null;
      }),
      find: jest.fn().mockImplementation((query: any) => {
        const matches = Array.from(storedReminders.values()).filter((item) => {
          if (query.milestoneId && item.milestoneId !== query.milestoneId) return false;
          return true;
        });
        return {
          distinct: async (field: string) => {
            return Array.from(new Set(matches.map((m) => m[field])));
          },
        };
      }),
      updateMany: jest.fn().mockImplementation(async (query: any, update: any) => {
        let count = 0;
        for (const [key, item] of storedReminders.entries()) {
          let match = true;
          if (query.userId && item.userId !== query.userId) match = false;
          if (query.milestoneId && item.milestoneId !== query.milestoneId) match = false;
          if (query.status && item.status !== query.status) match = false;
          if (query.deadlineVersion?.$lt && item.deadlineVersion >= query.deadlineVersion.$lt) match = false;

          if (match) {
            Object.assign(item, update.$set);
            storedReminders.set(key, item);
            count++;
          }
        }
        return { modifiedCount: count };
      }),
    };

    // Mock NotificationModel
    mockNotificationModel = {
      create: jest.fn().mockImplementation(async (data: any) => {
        storedNotifications.push(data);
        return data;
      }),
    };

    mockConfigService = {
      get: jest.fn((key: string, def: any) => def),
    };

    quietHoursService = new QuietHoursService();
    bookmarkListener = new BookmarkListener(
      mockReminderQueue,
      quietHoursService,
      mockReminderModel as any,
    );

    reminderWorker = new ReminderWorker(
      mockNotificationModel as any,
      mockReminderModel as any,
      mockConfigService as any,
    );
  });

  // =========================================================================
  // 1. TẠO NHẮC MILESTONE 7D, 3D, 24H & CHỈ TẠO MỐC TƯƠNG LAI
  // =========================================================================
  describe('1. NOTI-02: Tạo mốc nhắc tương lai 7 ngày, 3 ngày, 24 giờ', () => {
    it('Lập đúng 3 mốc (7d, 3d, 1d) khi deadline còn xa trong tương lai (30 ngày nữa)', async () => {
      const futureDeadline = moment().add(30, 'days').toDate();

      const created = await bookmarkListener.handleBookmarkCreated({
        userId: 'usr_student_01',
        opportunityId: 'opp_vinai_2026',
        deadline: futureDeadline,
        version: 1,
        timezone: 'Asia/Ho_Chi_Minh',
      });

      expect(created.length).toBe(3); // 7d, 3d, 1d
      expect(storedReminders.size).toBe(3);
      expect(mockReminderQueue.add).toHaveBeenCalledTimes(3);

      const offsets = Array.from(storedReminders.values()).map((r) => r.offset);
      expect(offsets).toContain('7d');
      expect(offsets).toContain('3d');
      expect(offsets).toContain('1d');
    });

    it('Nghiệm thu: Chỉ tạo mốc tương lai (nếu deadline chỉ còn 2 ngày, bỏ qua mốc 7d và 3d, chỉ tạo mốc 1d)', async () => {
      // Deadline chỉ còn 2 ngày (48 giờ) nữa
      const nearDeadline = moment().add(2, 'days').toDate();

      const created = await bookmarkListener.handleBookmarkCreated({
        userId: 'usr_student_02',
        opportunityId: 'opp_near_deadline',
        deadline: nearDeadline,
        version: 1,
        timezone: 'Asia/Ho_Chi_Minh',
      });

      // Mốc 7 ngày trước (đã qua 5 ngày trước) -> bỏ qua
      // Mốc 3 ngày trước (đã qua 1 ngày trước) -> bỏ qua
      // Mốc 1 ngày trước (24h nữa mới tới) -> được tạo
      expect(created.length).toBe(1);
      expect(created[0].offset).toBe('1d');
    });
  });

  // =========================================================================
  // 2. HỦY KHI BỎ LƯU (BOOKMARK DELETED)
  // =========================================================================
  describe('2. NOTI-02: Hủy nhắc nhở khi bỏ lưu bookmark', () => {
    it('Hủy toàn bộ nhắc nhở SCHEDULED sang CANCELLED và dọn job BullMQ khi user bỏ bookmark', async () => {
      // 1. Tạo bookmark và reminder ban đầu
      const futureDeadline = moment().add(20, 'days').toDate();
      await bookmarkListener.handleBookmarkCreated({
        userId: 'usr_student_cancel',
        opportunityId: 'opp_to_cancel',
        deadline: futureDeadline,
        version: 1,
        timezone: 'Asia/Ho_Chi_Minh',
      });

      expect(storedReminders.size).toBe(3);

      // 2. Người dùng hủy bookmark (bookmark.deleted)
      const res = await bookmarkListener.handleBookmarkDeleted({
        userId: 'usr_student_cancel',
        opportunityId: 'opp_to_cancel',
      });

      expect(res.success).toBe(true);

      // Toàn bộ reminder chuyển sang CANCELLED
      for (const rem of storedReminders.values()) {
        if (rem.userId === 'usr_student_cancel' && rem.milestoneId === 'opp_to_cancel') {
          expect(rem.status).toBe('CANCELLED');
          expect(rem.reason).toBe('BOOKMARK_REMOVED');
        }
      }
    });
  });

  // =========================================================================
  // 3. GIA HẠN TÍNH LẠI & JOB CŨ KHÔNG GỬI SAU THAY VERSION
  // =========================================================================
  describe('3. NOTI-02: Gia hạn tính lại & Chặn gửi job cũ khi version thay đổi', () => {
    it('Khi gia hạn cơ hội (v1 -> v2), hủy reminder cũ và tính lại milestone mới cho các sinh viên đã bookmark', async () => {
      const oldDeadline = moment().add(5, 'days').toDate();
      const newDeadline = moment().add(25, 'days').toDate();

      // User A đã lưu ở version 1
      await bookmarkListener.handleBookmarkCreated({
        userId: 'usr_student_extend',
        opportunityId: 'opp_extended',
        deadline: oldDeadline,
        version: 1,
        timezone: 'Asia/Ho_Chi_Minh',
      });

      // Cơ hội gia hạn sang v2 với newDeadline
      const updateRes = await bookmarkListener.handleOpportunityUpdated({
        opportunityId: 'opp_extended',
        newDeadline,
        version: 2,
        timezone: 'Asia/Ho_Chi_Minh',
      });

      expect(updateRes.success).toBe(true);

      // Các reminder v1 phải bị đánh dấu CANCELLED với reason VERSION_SUPERSEDED
      const v1Reminders = Array.from(storedReminders.values()).filter(
        (r) => r.milestoneId === 'opp_extended' && r.deadlineVersion === 1,
      );
      for (const r of v1Reminders) {
        expect(r.status).toBe('CANCELLED');
        expect(r.reason).toBe('VERSION_SUPERSEDED');
      }

      // Các reminder v2 mới được tính toán thành công
      const v2Reminders = Array.from(storedReminders.values()).filter(
        (r) => r.milestoneId === 'opp_extended' && r.deadlineVersion === 2,
      );
      expect(v2Reminders.length).toBeGreaterThan(0);
    });

    it('Worker không gửi nhắc nhở đối với job cũ khi cơ hội đã đổi version hoặc bị hủy', async () => {
      // Giả lập reminder trong DB đã bị CANCELLED
      storedReminders.set('rem_job_stale', {
        id: 'rem_job_stale',
        userId: 'usr_test',
        milestoneId: 'opp_stale',
        deadlineVersion: 1,
        status: 'CANCELLED',
        reason: 'VERSION_SUPERSEDED',
      });

      // Job v1 được kích hoạt từ hàng đợi
      const staleJob: any = {
        id: 'rem_usr_test_opp_stale_7d_v1',
        data: {
          userId: 'usr_test',
          opportunityId: 'opp_stale',
          version: 1,
          reason: 'NORMAL',
          plannedSendAt: new Date(),
        },
      };

      await reminderWorker.processJob(staleJob);

      // Kiểm tra: KHÔNG tạo inbox message nào vì job đã bị hủy do đổi version
      expect(storedNotifications.length).toBe(0);
    });

    it('Worker không gửi nhắc nhở sau khi đã qua hạn chót', async () => {
      // Giả lập reminder hợp lệ nhưng deadline đã qua
      storedReminders.set('rem_past_deadline', {
        id: 'rem_past_deadline',
        userId: 'usr_past',
        milestoneId: 'opp_past',
        deadlineVersion: 1,
        status: 'SCHEDULED',
      });

      // Mock fetchOpportunityStatus trả về deadline trong quá khứ
      jest.spyOn<any, any>(reminderWorker, 'fetchOpportunityStatus').mockResolvedValueOnce({
        status: 'PUBLISHED',
        version: 1,
        deadline: new Date(Date.now() - 10000), // Đã hết hạn
      });

      const pastJob: any = {
        id: 'rem_usr_past_opp_past_1d_v1',
        data: {
          userId: 'usr_past',
          opportunityId: 'opp_past',
          version: 1,
          reason: 'NORMAL',
          plannedSendAt: new Date(),
        },
      };

      await reminderWorker.processJob(pastJob);

      // Không gửi nhắc nhở sau hạn
      expect(storedNotifications.length).toBe(0);
    });
  });
});
