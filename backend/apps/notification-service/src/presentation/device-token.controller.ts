import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { z } from 'zod';
import { AuthenticatedUser, JwtAuthGuard, ZodValidationPipe } from '@shared';
import { DeviceTokenDocument, DeviceTokenModel } from '../infrastructure/persistence/notification.schema';

export const RegisterDeviceSchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(['android', 'ios']),
});
export type RegisterDeviceDto = z.infer<typeof RegisterDeviceSchema>;

@ApiTags('Notification Devices (Notification Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications/devices')
export class DeviceTokenController {
  constructor(
    @InjectModel(DeviceTokenModel.name)
    private readonly tokenModel: Model<DeviceTokenDocument>,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng ký FCM token của thiết bị cho tài khoản đang đăng nhập (gọi lại an toàn)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { token: { type: 'string' }, platform: { type: 'string', enum: ['android', 'ios'] } },
    },
  })
  @ApiResponse({ status: 200, description: 'Đã lưu token' })
  async register(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(RegisterDeviceSchema)) dto: RegisterDeviceDto,
  ) {
    // Upsert by token: the device now belongs to this account, not the one signed in before.
    await this.tokenModel.updateOne(
      { token: dto.token },
      { $set: { userId: req.user.userId, platform: dto.platform } },
      { upsert: true },
    );
    return { registered: true };
  }
}
