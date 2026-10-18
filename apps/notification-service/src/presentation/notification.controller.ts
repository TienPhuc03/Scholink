import { Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationUseCase } from '../application/use-cases/notification.use-case';
import { JwtAuthGuard, AuthenticatedUser } from '@shared';

@ApiTags('Notifications (Notification Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationUseCase: NotificationUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của người dùng hiện tại' })
  @ApiResponse({ status: 200, description: 'Danh sách thông báo' })
  async getMyNotifications(@Req() req: { user: AuthenticatedUser }) {
    return this.notificationUseCase.getMyNotifications(req.user.userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Đánh dấu thông báo đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu đã đọc' })
  async markAsRead(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.notificationUseCase.markAsRead(id, req.user.userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo là đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu tất cả đã đọc' })
  async markAllRead(@Req() req: { user: AuthenticatedUser }) {
    return this.notificationUseCase.markAllRead(req.user.userId);
  }
}
