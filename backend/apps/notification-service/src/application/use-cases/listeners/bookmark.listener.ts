import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import moment = require('moment-timezone');
import { QuietHoursService } from '../services/quiet-hours.service';
import {
  ReminderModel,
  ReminderDocument,
} from '../../../infrastructure/persistence/notification.schema';

@Injectable()
export class BookmarkListener {
  private readonly logger = new Logger(BookmarkListener.name);

  constructor(
    @InjectQueue('reminder-queue') private readonly reminderQueue: Queue,
    private readonly quietHoursService: QuietHoursService,
    @InjectModel(ReminderModel.name)
    private readonly reminderModel: Model<ReminderDocument>,
  ) {}

  /**
   * FR-NOTI-02: Lập nhắc theo từng milestone ở 7 ngày, 3 ngày, 24 giờ.
   * Nghiệm thu: chỉ tạo mốc tương lai, tuân thủ giờ yên lặng (BR10, BR13, 12D)
   */
  @OnEvent('bookmark.created')
  async handleBookmarkCreated(payload: {
    userId: string;
    opportunityId: string;
    deadline: Date | string;
    version?: number;
    timezone?: string;
    title?: string;
  }) {
    const offsets = [7, 3, 1]; // 7 ngày, 3 ngày, 24 giờ
    const deadline = new Date(payload.deadline);
    const timezone = payload.timezone || 'Asia/Ho_Chi_Minh';
    const version = payload.version || 1;
    const now = new Date();

    const createdReminders = [];

    for (const days of offsets) {
      const dueAt = moment(deadline).tz(timezone).subtract(days, 'days').toDate();

      // Nghiệm thu: Chỉ tạo mốc tương lai
      if (dueAt.getTime() <= now.getTime()) {
        this.logger.debug(
          `Bỏ qua mốc ${days} ngày cho cơ hội ${payload.opportunityId} vì thời điểm ${dueAt.toISOString()} đã qua.`,
        );
        continue;
      }

      const { plannedSendAt, reason } = this.quietHoursService.calculatePlannedSendAt(
        dueAt,
        deadline,
        timezone,
      );

      const offsetLabel = days === 1 ? '1d' : `${days}d`;
      const reminderId = `rem_${payload.userId}_${payload.opportunityId}_${offsetLabel}_v${version}`;

      // Upsert vào MongoDB Reminder collection
      const reminder = await this.reminderModel.findOneAndUpdate(
        {
          userId: payload.userId,
          source: 'OPPORTUNITY_BOOKMARK',
          milestoneId: payload.opportunityId,
          offset: offsetLabel,
          deadlineVersion: version,
        },
        {
          id: reminderId,
          userId: payload.userId,
          source: 'OPPORTUNITY_BOOKMARK',
          milestoneId: payload.opportunityId,
          offset: offsetLabel,
          deadlineVersion: version,
          preferenceVersion: 1,
          dueAt,
          plannedSendAt: plannedSendAt || dueAt,
          status: reason === 'SUPPRESSED_QUIET_DEADLINE' ? 'SUPPRESSED_QUIET_DEADLINE' : 'SCHEDULED',
          reason,
        },
        { upsert: true, new: true },
      );
      createdReminders.push(reminder);

      // Đẩy vào BullMQ Queue
      if (plannedSendAt && reason !== 'SUPPRESSED_QUIET_DEADLINE') {
        const delay = Math.max(0, plannedSendAt.getTime() - Date.now());
        try {
          await this.reminderQueue.add(
            'send-reminder',
            {
              userId: payload.userId,
              opportunityId: payload.opportunityId,
              title: payload.title || 'Nhắc nhở hạn chót',
              offset: days,
              dueAt,
              plannedSendAt,
              reason,
              version,
            },
            {
              jobId: reminderId,
              delay,
              removeOnComplete: true,
            },
          );
        } catch (err: any) {
          this.logger.warn(`BullMQ queue offline: ${err.message}`);
        }
      }
    }

    return createdReminders;
  }

  /**
   * FR-NOTI-02: Hủy khi bỏ lưu
   * Hủy các reminder đang SCHEDULED và xóa job BullMQ tương ứng
   */
  @OnEvent('bookmark.deleted')
  async handleBookmarkDeleted(payload: {
    userId: string;
    opportunityId: string;
  }) {
    this.logger.log(`Hủy nhắc nhở khi bỏ lưu: User ${payload.userId}, Opp ${payload.opportunityId}`);

    // 1. Cập nhật trạng thái CANCELLED trong Database
    const res = await this.reminderModel.updateMany(
      {
        userId: payload.userId,
        milestoneId: payload.opportunityId,
        status: 'SCHEDULED',
      },
      {
        $set: {
          status: 'CANCELLED',
          reason: 'BOOKMARK_REMOVED',
        },
      },
    );

    // 2. Xóa các job đang chờ trong BullMQ queue
    const offsets = ['7d', '3d', '1d'];
    for (const offset of offsets) {
      try {
        const jobs = await this.reminderQueue.getJobs(['delayed', 'waiting']);
        for (const job of jobs) {
          if (
            job.id &&
            job.id.startsWith(`rem_${payload.userId}_${payload.opportunityId}_${offset}`)
          ) {
            await job.remove();
          }
        }
      } catch {
        // Safe ignore when Redis is offline
      }
    }

    return { success: true, cancelledCount: res.modifiedCount };
  }

  /**
   * FR-NOTI-02: Gia hạn tính lại, job cũ không gửi sau thay version
   */
  @OnEvent('opportunity.updated')
  async handleOpportunityUpdated(payload: {
    opportunityId: string;
    newDeadline: Date | string;
    version: number;
    timezone?: string;
  }) {
    this.logger.log(`Cơ hội ${payload.opportunityId} đổi hạn chót hoặc version mới (v${payload.version}). Tính lại nhắc nhở.`);

    // 1. Đánh dấu các nhắc nhở cũ là CANCELLED (VERSION_SUPERSEDED)
    await this.reminderModel.updateMany(
      {
        milestoneId: payload.opportunityId,
        deadlineVersion: { $lt: payload.version },
        status: 'SCHEDULED',
      },
      {
        $set: {
          status: 'CANCELLED',
          reason: 'VERSION_SUPERSEDED',
        },
      },
    );

    // 2. Tìm tất cả user đã từng lưu cơ hội này
    const distinctUsers = await this.reminderModel
      .find({ milestoneId: payload.opportunityId })
      .distinct('userId');

    // 3. Tính lại milestone mới cho từng user
    for (const userId of distinctUsers) {
      await this.handleBookmarkCreated({
        userId,
        opportunityId: payload.opportunityId,
        deadline: payload.newDeadline,
        version: payload.version,
        timezone: payload.timezone,
      });
    }

    return { success: true, recalculatedUsers: distinctUsers.length };
  }

  /**
   * Hủy cơ hội -> Hủy toàn bộ nhắc nhở liên quan
   */
  @OnEvent('opportunity.cancelled')
  async handleOpportunityCancelled(payload: { opportunityId: string }) {
    this.logger.log(`Cơ hội ${payload.opportunityId} đã bị hủy. Hủy mọi lịch nhắc.`);
    return await this.reminderModel.updateMany(
      {
        milestoneId: payload.opportunityId,
        status: 'SCHEDULED',
      },
      {
        $set: {
          status: 'CANCELLED',
          reason: 'OPPORTUNITY_CANCELLED',
        },
      },
    );
  }
}
