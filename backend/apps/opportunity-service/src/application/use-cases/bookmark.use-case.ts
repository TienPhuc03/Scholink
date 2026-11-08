import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainException } from '@shared';
import {
  BookmarkModel,
  BookmarkDocument,
  OpportunityModel,
  OpportunityDocument,
} from '../../infrastructure/persistence/opportunity.schema';

@Injectable()
export class BookmarkUseCase {
  private readonly logger = new Logger(BookmarkUseCase.name);

  constructor(
    @InjectModel(BookmarkModel.name)
    private readonly bookmarkModel: Model<BookmarkDocument>,
    @InjectModel(OpportunityModel.name)
    private readonly opportunityModel: Model<OpportunityDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async dispatchEvent(endpoint: string, payload: any): Promise<void> {
    const notiUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
    try {
      await fetch(`${notiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      }).catch((err: Error) => {
        // The bookmark itself is saved; reminders are recalculated on the next bookmark event.
        this.logger.warn(`Không gửi được sự kiện ${endpoint} tới Notification Service: ${err.message}`);
      });
    } catch {
      // Ignore network errors in local/mock testing
    }
  }

  /**
   * F14 / OPP-06: lưu hoặc bỏ lưu một cơ hội.
   *
   * `targetBookmarked` makes the call idempotent: a client that retries after a lost response
   * sends the same target state and gets the same result, instead of flipping it back.
   * Without it the endpoint keeps the old toggle behaviour.
   */
  async toggleBookmark(
    userId: string,
    opportunityId: string,
    targetBookmarked?: boolean,
  ): Promise<{ opportunityId: string; bookmarked: boolean; changed: boolean }> {
    const existing = await this.bookmarkModel.findOne({ userId, opportunityId });
    const wantBookmarked = typeof targetBookmarked === 'boolean' ? targetBookmarked : !existing;

    if (!wantBookmarked) {
      if (!existing) return { opportunityId, bookmarked: false, changed: false };

      await this.bookmarkModel.deleteOne({ _id: existing._id });
      const delPayload = { userId, opportunityId };
      this.eventEmitter.emit('bookmark.deleted', delPayload);
      await this.dispatchEvent('/api/v1/notifications/events/bookmark-deleted', delPayload);
      return { opportunityId, bookmarked: false, changed: true };
    }

    if (existing) return { opportunityId, bookmarked: true, changed: false };

    // Không cho lưu cơ hội không tồn tại: nhắc hạn sẽ không có deadline thật.
    const opp = await this.opportunityModel.findOne({ id: opportunityId }).lean();
    if (!opp) {
      throw DomainException.notFound('Cơ hội');
    }

    const newBookmark = new this.bookmarkModel({
      id: `bmk_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      opportunityId,
    });
    try {
      await newBookmark.save();
    } catch (err: any) {
      // Unique (userId, opportunityId): a concurrent request already saved it.
      if (err?.code === 11000) return { opportunityId, bookmarked: true, changed: false };
      throw err;
    }

    // Lấy thông tin cơ hội để cung cấp deadline, version, timezone cho Notification Service (FR-NOTI-02)
    const createdPayload = {
      userId,
      opportunityId,
      deadline: opp.registerDeadline,
      version: opp.version || 1,
      timezone: opp.timezone || 'Asia/Ho_Chi_Minh',
      title: opp.title || 'Cơ hội đã lưu',
    };

    this.eventEmitter.emit('bookmark.created', createdPayload);
    await this.dispatchEvent('/api/v1/notifications/events/bookmark-created', createdPayload);

    return { opportunityId, bookmarked: true, changed: true };
  }

  /**
   * OPP-06: danh sách cơ hội đã lưu của người dùng, để app đồng bộ bookmark giữa các thiết bị.
   * Cơ hội đã bị gỡ khỏi catalog vẫn trả id (để app bỏ đánh dấu) nhưng không kèm dữ liệu.
   */
  async listMyBookmarks(userId: string): Promise<{
    opportunityIds: string[];
    items: Array<{ opportunityId: string; bookmarkedAt?: string }>;
  }> {
    const bookmarks = await this.bookmarkModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const items = (bookmarks as Array<Record<string, any>>).map((b) => ({
      opportunityId: String(b.opportunityId),
      bookmarkedAt: b.createdAt ? new Date(b.createdAt).toISOString() : undefined,
    }));

    return { opportunityIds: items.map((i) => i.opportunityId), items };
  }
}
