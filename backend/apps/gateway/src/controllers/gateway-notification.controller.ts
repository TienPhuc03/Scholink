import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@shared';

const NOTI_URL = () => process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';

async function forwardNoti(path: string, options: RequestInit = {}) {
  const url = `${NOTI_URL()}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return data;
}

@ApiTags('Notifications (Notification Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class GatewayNotificationController {
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo in-app của người dùng' })
  @ApiResponse({ status: 200, description: 'Danh sách thông báo' })
  async getMyNotifications(@Headers('authorization') auth: string) {
    return forwardNoti('/api/v1/notifications', {
      headers: { Authorization: auth },
    });
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu đã đọc' })
  async markAsRead(@Param('id') id: string, @Headers('authorization') auth: string) {
    return forwardNoti(`/api/v1/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: auth },
    });
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo là đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu tất cả đã đọc' })
  async markAllRead(@Headers('authorization') auth: string) {
    return forwardNoti('/api/v1/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: auth },
    });
  }
}
