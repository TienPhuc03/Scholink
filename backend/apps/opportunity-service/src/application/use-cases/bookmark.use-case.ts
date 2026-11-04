import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  BookmarkModel,
  BookmarkDocument,
} from "../../infrastructure/persistence/opportunity.schema";

@Injectable()
export class BookmarkUseCase {
  constructor(
    @InjectModel(BookmarkModel.name)
    private readonly bookmarkModel: Model<BookmarkDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

      this.eventEmitter.emit("bookmark.deleted", { userId, opportunityId });
      return { bookmarked: false };
    }

    const newBookmark = new this.bookmarkModel({
      id: `bmk_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      opportunityId,
    });
    await newBookmark.save();

    this.eventEmitter.emit("bookmark.created", { userId, opportunityId });
    return { bookmarked: true };
  }
}
