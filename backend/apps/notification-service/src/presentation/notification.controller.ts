import { Controller, Get, Post, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationUseCase } from '../application/use-cases/notification.use-case';
import { BookmarkListener } from '../application/use-cases/listeners/bookmark.listener';
import { JwtAuthGuard, Public, AuthenticatedUser } from '@shared';
import {
  ReminderModel,
  ReminderDocument,
  NotificationModel,
  NotificationDocument,
} from '../infrastructure/persistence/notification.schema';

@ApiTags('Notifications (Notification Microservice)')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class NotificationController {
  constructor(
    private readonly notificationUseCase: NotificationUseCase,
    private readonly bookmarkListener: BookmarkListener,
    @InjectModel(ReminderModel.name)
    private readonly reminderModel: Model<ReminderDocument>,
    @InjectModel(NotificationModel.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của người dùng hiện tại' })
  @ApiResponse({ status: 200, description: 'Danh sách thông báo' })
  async getMyNotifications(@Req() req: { user: AuthenticatedUser }) {
    return this.notificationUseCase.getMyNotifications(req.user.userId);
  }

  @Post(':id/read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đánh dấu thông báo đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu đã đọc' })
  async markAsRead(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.notificationUseCase.markAsRead(id, req.user.userId);
  }

  @Post('read-all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo là đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu tất cả đã đọc' })
  async markAllRead(@Req() req: { user: AuthenticatedUser }) {
    return this.notificationUseCase.markAllRead(req.user.userId);
  }

  // =========================================================================
  // INTERNAL EVENT INTEGRATION ENDPOINTS (FR-NOTI-02 & SCHOL-28)
  // =========================================================================

  @Public()
  @Post('events/bookmark-created')
  @ApiOperation({ summary: 'Sự kiện người dùng bookmark cơ hội (Tạo nhắc 7d, 3d, 1d)' })
  async onBookmarkCreated(
    @Body()
    body: {
      userId: string;
      opportunityId: string;
      deadline: Date | string;
      version?: number;
      timezone?: string;
      title?: string;
    },
  ) {
    return this.bookmarkListener.handleBookmarkCreated(body);
  }

  @Public()
  @Post('events/bookmark-deleted')
  @ApiOperation({ summary: 'Sự kiện người dùng hủy bookmark cơ hội (Hủy các nhắc nhở đã lên lịch)' })
  async onBookmarkDeleted(
    @Body()
    body: {
      userId: string;
      opportunityId: string;
    },
  ) {
    return this.bookmarkListener.handleBookmarkDeleted(body);
  }

  @Public()
  @Post('events/opportunity-updated')
  @ApiOperation({ summary: 'Sự kiện cơ hội gia hạn / cập nhật version (Tính lại nhắc nhở)' })
  async onOpportunityUpdated(
    @Body()
    body: {
      opportunityId: string;
      newDeadline: Date | string;
      version: number;
      timezone?: string;
    },
  ) {
    return this.bookmarkListener.handleOpportunityUpdated(body);
  }

  @Public()
  @Post('events/opportunity-cancelled')
  @ApiOperation({ summary: 'Sự kiện cơ hội bị hủy (Hủy các nhắc nhở)' })
  async onOpportunityCancelled(
    @Body()
    body: {
      opportunityId: string;
    },
  ) {
    return this.bookmarkListener.handleOpportunityCancelled(body);
  }

  @Public()
  @Post('events/opportunity-published')
  @ApiOperation({ summary: 'Sự kiện cơ hội vừa được công bố' })
  async onOpportunityPublished(
    @Body()
    body: {
      opportunityId: string;
      title: string;
      type: string;
      deadline: Date | string;
      version: number;
      timezone?: string;
    },
  ) {
    return { success: true, received: body.opportunityId };
  }

  @Public()
  @Post('transactional')
  @ApiOperation({ summary: 'Tạo thông báo giao dịch trực tiếp với dedup key' })
  async createTransactional(
    @Body()
    body: {
      userId: string;
      businessKey: string;
      type: string;
      title: string;
      body: string;
      refUrl?: string;
    },
  ) {
    const existing = await this.notificationModel.findOne({
      userId: body.userId,
      businessKey: body.businessKey,
    });
    if (existing) {
      return existing; // Chống duplicate chính xác (dedup)
    }

    const notif = new this.notificationModel({
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: body.userId,
      businessKey: body.businessKey,
      type: body.type,
      title: body.title,
      body: body.body,
      refUrl: body.refUrl,
      isRead: false,
    });
    await notif.save();
    return notif;
  }

  @Public()
  @Get('reminders')
  @ApiOperation({ summary: 'Lấy danh sách nhắc nhở (hỗ trợ kiểm thử / debug)' })
  async listReminders(
    @Query('userId') userId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('status') status?: string,
  ) {
    const query: Record<string, any> = {};
    if (userId) query.userId = userId;
    if (opportunityId) query.milestoneId = opportunityId;
    if (status) query.status = status;

    return this.reminderModel.find(query).sort({ plannedSendAt: 1 }).lean().exec();
  }
}
