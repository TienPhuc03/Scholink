import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
      }).catch(() => {
        // Safe failover when running in isolated test or offline environment
      });
    } catch {
      // Ignore network errors in local/mock testing
    }
  }

  async toggleBookmark(
    userId: string,
    opportunityId: string,
  ): Promise<{ bookmarked: boolean }> {
    const existing = await this.bookmarkModel.findOne({
      userId,
      opportunityId,
    });

    if (existing) {
      await this.bookmarkModel.deleteOne({ _id: existing._id });

      const delPayload = { userId, opportunityId };
      this.eventEmitter.emit('bookmark.deleted', delPayload);
      await this.dispatchEvent('/api/v1/notifications/events/bookmark-deleted', delPayload);

      return { bookmarked: false };
    }

    const newBookmark = new this.bookmarkModel({
      id: `bmk_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      opportunityId,
    });
    await newBookmark.save();

    // Lấy thông tin cơ hội để cung cấp deadline, version, timezone cho Notification Service (FR-NOTI-02)
    const opp = await this.opportunityModel.findOne({ id: opportunityId }).lean();
    const createdPayload = {
      userId,
      opportunityId,
      deadline: opp?.registerDeadline || new Date(Date.now() + 30 * 86400000),
      version: opp?.version || 1,
      timezone: opp?.timezone || 'Asia/Ho_Chi_Minh',
      title: opp?.title || 'Cơ hội đã lưu',
    };

    this.eventEmitter.emit('bookmark.created', createdPayload);
    await this.dispatchEvent('/api/v1/notifications/events/bookmark-created', createdPayload);

    return { bookmarked: true };
  }
}
