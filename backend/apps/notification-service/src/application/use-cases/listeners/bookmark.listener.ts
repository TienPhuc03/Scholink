import { Injectable, Logger, Optional } from '@nestjs/common';
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
  NotificationPreferenceModel,
  NotificationPreferenceDocument,
} from '../../../infrastructure/persistence/notification.schema';

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Offsets in days before the deadline (FR-NOTI-02: 7 ngày, 3 ngày, 24 giờ). */
const REMINDER_OFFSET_DAYS = [7, 3, 1];

export function offsetLabel(days: number): string {
  return `${days}d`;
}

/** BullMQ job id of one reminder plan; the preference version makes a re-planned job distinct. */
export function reminderJobId(reminderId: string, preferenceVersion: number): string {
  return preferenceVersion > 1 ? `${reminderId}_p${preferenceVersion}` : reminderId;
}

@Injectable()
export class BookmarkListener {
  private readonly logger = new Logger(BookmarkListener.name);

  constructor(
    @InjectQueue('reminder-queue') private readonly reminderQueue: Queue,
    private readonly quietHoursService: QuietHoursService,
    @InjectModel(ReminderModel.name)
    private readonly reminderModel: Model<ReminderDocument>,
    @Optional()
    @InjectModel(NotificationPreferenceModel.name)
    private readonly preferenceModel?: Model<NotificationPreferenceDocument>,
  ) {}

  /**
   * NOTI-03: quiet hours follow the user's own timezone when they set one; otherwise the
   * opportunity's timezone, then the platform default.
   */
  private async resolveUserPlan(
    userId: string,
    fallbackTimezone?: string,
  ): Promise<{ timezone: string; preferenceVersion: number }> {
    let pref: { timezone?: string; preferenceVersion?: number } | null = null;
    if (this.preferenceModel) {
      try {
        pref = await this.preferenceModel.findOne({ userId }).lean();
      } catch {
        pref = null;
      }
    }
    const candidate = pref?.timezone || fallbackTimezone || DEFAULT_TIMEZONE;
    return {
      timezone: moment.tz.zone(candidate) ? candidate : DEFAULT_TIMEZONE,
      preferenceVersion: pref?.preferenceVersion || 1,
    };
  }

  private async hasNewerVersion(opportunityId: string, version: number, userId?: string): Promise<boolean> {
    try {
      const query: Record<string, unknown> = { milestoneId: opportunityId, deadlineVersion: { $gt: version } };
      if (userId) query.userId = userId;
      return Boolean(await this.reminderModel.findOne(query));
    } catch {
      return false;
    }
  }

  private async enqueue(
    jobId: string,
    data: Record<string, unknown>,
    plannedSendAt: Date,
  ): Promise<void> {
    const delay = Math.max(0, plannedSendAt.getTime() - Date.now());
    try {
      await this.reminderQueue.add('send-reminder', data, {
        jobId,
        delay,
        removeOnComplete: true,
      });
    } catch (err: any) {
      this.logger.warn(`BullMQ queue offline: ${err.message}`);
    }
  }

  private async removeQueuedJobs(prefix: string): Promise<void> {
    try {
      const jobs = await this.reminderQueue.getJobs(['delayed', 'waiting']);
      for (const job of jobs) {
        if (job.id && job.id.startsWith(prefix)) {
          await job.remove();
        }
      }
    } catch {
      // Safe ignore when Redis is offline
    }
  }

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
    const deadline = new Date(payload.deadline);
    const version = payload.version || 1;
    const now = new Date();
    const createdReminders = [];

    if (Number.isNaN(deadline.getTime())) {
      this.logger.warn(`Bỏ qua lập nhắc cho ${payload.opportunityId}: deadline không hợp lệ.`);
      return createdReminders;
    }

    // F35: a bookmark event carrying an older deadline version than one already planned arrived
    // out of order; planning it would bring the old deadline back.
    if (await this.hasNewerVersion(payload.opportunityId, version, payload.userId)) {
      this.logger.log(`Bỏ qua sự kiện bookmark cũ (v${version}) cho ${payload.opportunityId}.`);
      return createdReminders;
    }

    const { timezone, preferenceVersion } = await this.resolveUserPlan(
      payload.userId,
      payload.timezone,
    );

    for (const days of REMINDER_OFFSET_DAYS) {
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

      const offset = offsetLabel(days);
      const reminderId = `rem_${payload.userId}_${payload.opportunityId}_${offset}_v${version}`;

      // Upsert vào MongoDB Reminder collection
      const reminder = await this.reminderModel.findOneAndUpdate(
        {
          userId: payload.userId,
          source: 'OPPORTUNITY_BOOKMARK',
          milestoneId: payload.opportunityId,
          offset,
          deadlineVersion: version,
        },
        {
          id: reminderId,
          userId: payload.userId,
          source: 'OPPORTUNITY_BOOKMARK',
          milestoneId: payload.opportunityId,
          offset,
          deadlineVersion: version,
          preferenceVersion,
          dueAt,
          deadlineAt: deadline,
          title: payload.title,
          timezone,
          plannedSendAt: plannedSendAt || dueAt,
          status: reason === 'SUPPRESSED_QUIET_DEADLINE' ? 'SUPPRESSED_QUIET_DEADLINE' : 'SCHEDULED',
          reason,
        },
        { upsert: true, new: true },
      );
      createdReminders.push(reminder);

      // Đẩy vào BullMQ Queue
      if (plannedSendAt && reason !== 'SUPPRESSED_QUIET_DEADLINE') {
        await this.enqueue(
          reminderJobId(reminderId, preferenceVersion),
          {
            userId: payload.userId,
            opportunityId: payload.opportunityId,
            title: payload.title || 'Nhắc nhở hạn chót',
            offset: days,
            offsetLabel: offset,
            dueAt,
            plannedSendAt,
            reason,
            version,
            preferenceVersion,
          },
          plannedSendAt,
        );
      }
    }

    return createdReminders;
  }

  /**
   * NOTI-03: the user changed timezone. Re-plan every reminder that has not been sent yet with
   * the new quiet hours; the old jobs are removed and, if one still fires, the worker drops it
   * because its preferenceVersion is older than the reminder's.
   */
  async rescheduleForUser(userId: string): Promise<{ rescheduled: number }> {
    const { timezone, preferenceVersion } = await this.resolveUserPlan(userId);
    const pending = await this.reminderModel
      .find({ userId, status: { $in: ['SCHEDULED', 'SUPPRESSED_QUIET_DEADLINE'] } })
      .exec();

    let rescheduled = 0;
    for (const reminder of pending as Array<ReminderDocument & { save?: () => Promise<unknown> }>) {
      const days = parseInt(String(reminder.offset), 10) || 1;
      const deadline = reminder.deadlineAt
        ? new Date(reminder.deadlineAt)
        : moment(reminder.dueAt).add(days, 'days').toDate();
      if (deadline.getTime() <= Date.now()) continue;

      const { plannedSendAt, reason } = this.quietHoursService.calculatePlannedSendAt(
        reminder.dueAt,
        deadline,
        timezone,
      );

      await this.removeQueuedJobs(reminder.id);

      reminder.preferenceVersion = preferenceVersion;
      reminder.timezone = timezone;
      reminder.plannedSendAt = plannedSendAt || reminder.dueAt;
      reminder.reason = reason;
      reminder.status = reason === 'SUPPRESSED_QUIET_DEADLINE' ? 'SUPPRESSED_QUIET_DEADLINE' : 'SCHEDULED';
      if (typeof reminder.save === 'function') await reminder.save();

      if (plannedSendAt && reason !== 'SUPPRESSED_QUIET_DEADLINE') {
        await this.enqueue(
          reminderJobId(reminder.id, preferenceVersion),
          {
            userId,
            opportunityId: reminder.milestoneId,
            title: reminder.title || 'Nhắc nhở hạn chót',
            offset: days,
            offsetLabel: reminder.offset,
            dueAt: reminder.dueAt,
            plannedSendAt,
            reason,
            version: reminder.deadlineVersion,
            preferenceVersion,
          },
          plannedSendAt,
        );
      }
      rescheduled++;
    }
    return { rescheduled };
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

    // 2. Xóa các job đang chờ trong BullMQ queue (mọi offset, mọi version)
    await this.removeQueuedJobs(`rem_${payload.userId}_${payload.opportunityId}_`);

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
    title?: string;
  }) {
    this.logger.log(`Cơ hội ${payload.opportunityId} đổi hạn chót hoặc version mới (v${payload.version}). Tính lại nhắc nhở.`);

    // F35 (event đảo thứ tự): a v2 update arriving after v3 must not re-plan the v2 deadline.
    if (await this.hasNewerVersion(payload.opportunityId, payload.version)) {
      this.logger.log(`Bỏ qua sự kiện cũ v${payload.version} của ${payload.opportunityId}: đã có version mới hơn.`);
      return { success: true, recalculatedUsers: 0, ignored: 'STALE_VERSION' };
    }

    // 1. Tìm user còn theo dõi (có nhắc chưa gửi/chưa hủy) TRƯỚC khi hủy, để người đã bỏ lưu
    //    không bị lập nhắc lại.
    const distinctUsers = await this.reminderModel
      .find({
        milestoneId: payload.opportunityId,
        status: { $in: ['SCHEDULED', 'SENT', 'SUPPRESSED_QUIET_DEADLINE'] },
      })
      .distinct('userId');

    // 2. Đánh dấu các nhắc nhở cũ là CANCELLED (VERSION_SUPERSEDED)
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

    // 3. Tính lại milestone mới cho từng user
    for (const userId of distinctUsers) {
      await this.handleBookmarkCreated({
        userId,
        opportunityId: payload.opportunityId,
        deadline: payload.newDeadline,
        version: payload.version,
        timezone: payload.timezone,
        title: payload.title,
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
