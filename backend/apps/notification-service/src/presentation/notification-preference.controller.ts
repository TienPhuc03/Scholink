import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, JwtAuthGuard, ZodValidationPipe } from '@shared';
import {
  NotificationPreferenceUseCase,
  UpdateNotificationPreferenceDto,
  UpdateNotificationPreferenceSchema,
} from '../application/use-cases/notification-preference.use-case';

@ApiTags('Notification Preferences (Notification Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications/preferences')
export class NotificationPreferenceController {
  constructor(private readonly preferenceUseCase: NotificationPreferenceUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Kênh nhận thông báo, múi giờ và giờ yên lặng của tôi (NOTI-03)' })
  @ApiResponse({ status: 200, description: 'Cài đặt hiện tại (mặc định nếu chưa lưu)' })
  async getMine(@Req() req: { user: AuthenticatedUser }) {
    return this.preferenceUseCase.get(req.user.userId);
  }

  @Put()
  @ApiOperation({
    summary: 'Cập nhật kênh (push/email) và múi giờ. Đổi múi giờ sẽ lập lại các nhắc chưa gửi.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        timezone: { type: 'string', example: 'Asia/Ho_Chi_Minh' },
        pushEnabled: { type: 'boolean', example: true },
        emailEnabled: { type: 'boolean', example: false },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Cài đặt sau khi lưu' })
  @ApiResponse({ status: 400, description: 'Múi giờ hoặc dữ liệu không hợp lệ' })
  async updateMine(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(UpdateNotificationPreferenceSchema)) dto: UpdateNotificationPreferenceDto,
  ) {
    return this.preferenceUseCase.update(req.user.userId, dto);
  }
}
