import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import moment = require('moment-timezone');
import {
  NotificationPreferenceModel,
  NotificationPreferenceDocument,
} from '../../infrastructure/persistence/notification.schema';
import { BookmarkListener, DEFAULT_TIMEZONE } from './listeners/bookmark.listener';

/** Quiet hours are fixed by the SRS (12D): [22:00, 07:00) in the user's timezone. */
const QUIET_START = '22:00';
const QUIET_END = '07:00';

export const UpdateNotificationPreferenceSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine((tz) => Boolean(moment.tz.zone(tz)), 'Múi giờ không hợp lệ (cần tên IANA, ví dụ Asia/Ho_Chi_Minh)')
      .optional(),
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
  })
  .strict();

export type UpdateNotificationPreferenceDto = z.infer<typeof UpdateNotificationPreferenceSchema>;

export interface NotificationPreferenceView {
  userId: string;
  timezone: string;
  /** In-app inbox is always on: reminders and application updates must stay visible. */
  inAppEnabled: true;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  preferenceVersion: number;
  updatedAt?: string;
}

/** NOTI-03 / F29: kênh nhận thông báo và múi giờ người dùng. */
@Injectable()
export class NotificationPreferenceUseCase {
  constructor(
    @InjectModel(NotificationPreferenceModel.name)
    private readonly preferenceModel: Model<NotificationPreferenceDocument>,
    private readonly bookmarkListener: BookmarkListener,
  ) {}

  private toView(userId: string, doc?: Record<string, any> | null): NotificationPreferenceView {
    return {
      userId,
      timezone: doc?.timezone || DEFAULT_TIMEZONE,
      inAppEnabled: true,
      pushEnabled: doc?.pushEnabled !== false,
      emailEnabled: doc?.emailEnabled !== false,
      quietStart: QUIET_START,
      quietEnd: QUIET_END,
      preferenceVersion: doc?.preferenceVersion || 1,
      updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
    };
  }

  async get(userId: string): Promise<NotificationPreferenceView> {
    const doc = await this.preferenceModel.findOne({ userId }).lean();
    return this.toView(userId, doc as Record<string, any> | null);
  }

  /**
   * Saves only the fields sent. A timezone change bumps preferenceVersion and re-plans the
   * reminders that were not sent yet, so quiet hours follow the new timezone.
   */
  async update(
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceView & { rescheduledReminders: number }> {
    const current = (await this.preferenceModel.findOne({ userId }).lean()) as Record<string, any> | null;
    const currentTz = current?.timezone || DEFAULT_TIMEZONE;
    const timezoneChanged = dto.timezone !== undefined && dto.timezone !== currentTz;

    const set: Record<string, unknown> = {};
    if (dto.timezone !== undefined) set.timezone = dto.timezone;
    if (dto.pushEnabled !== undefined) set.pushEnabled = dto.pushEnabled;
    if (dto.emailEnabled !== undefined) set.emailEnabled = dto.emailEnabled;

    // Reminders planned before any preference was saved carry version 1, so the first timezone
    // change must produce 2 for the worker to drop the old jobs.
    const preferenceVersion = (current?.preferenceVersion || 1) + (timezoneChanged ? 1 : 0);

    const saved = await this.preferenceModel
      .findOneAndUpdate(
        { userId },
        {
          $set: { ...set, preferenceVersion, quietStart: QUIET_START, quietEnd: QUIET_END },
          $setOnInsert: { userId },
        },
        { upsert: true, new: true },
      )
      .lean();

    let rescheduledReminders = 0;
    if (timezoneChanged) {
      rescheduledReminders = (await this.bookmarkListener.rescheduleForUser(userId)).rescheduled;
    }

    return { ...this.toView(userId, saved as Record<string, any> | null), rescheduledReminders };
  }
}
