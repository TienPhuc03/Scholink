// backend/apps/notification-service/src/application/listeners/bookmark.listener.ts
import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import moment = require("moment-timezone");
import { QuietHoursService } from "../services/quiet-hours.service";

@Injectable()
export class BookmarkListener {
  constructor(
    @InjectQueue("reminder-queue") private readonly reminderQueue: Queue,
    private readonly quietHoursService: QuietHoursService,
  ) {}

  @OnEvent("bookmark.created")
  async handleBookmarkCreated(payload: {
    userId: string;
    opportunityId: string;
    deadline: Date;
    version: number;
    timezone: string;
  }) {
    const offsets = [7, 3, 1]; // 7 ngày, 3 ngày, 24 giờ

    for (const days of offsets) {
      const dueAt = moment(payload.deadline).subtract(days, "days").toDate();
      const { plannedSendAt, reason } =
        this.quietHoursService.calculatePlannedSendAt(
          dueAt,
          payload.deadline,
          payload.timezone,
        );

      const jobId = `rem_${payload.userId}_${payload.opportunityId}_${days}d_v${payload.version}`; // Unique key chống trùng

      // Inbox luôn ghi đúng dueAt, Push gửi theo plannedSendAt
      await this.reminderQueue.add(
        "send-reminder",
        {
          ...payload,
          offset: days,
          dueAt,
          reason,
          plannedSendAt,
        },
        {
          jobId, // Tránh tạo trùng lặp
          delay: plannedSendAt
            ? plannedSendAt.getTime() - Date.now()
            : dueAt.getTime() - Date.now(),
          removeOnComplete: true,
        },
      );
    }
  }

  @OnEvent("bookmark.deleted")
  async handleBookmarkDeleted(payload: {
    userId: string;
    opportunityId: string;
  }) {}
}
