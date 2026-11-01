import { Controller, Get, Post, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ChatUseCase } from '../application/use-cases/chat.use-case';
import {
  SendMessageDto,
  SendMessageDtoSchema,
  QueryMessagesDto,
  QueryMessagesDtoSchema,
  MarkReadDto,
  MarkReadDtoSchema,
} from '../application/dtos/collaboration.dto';
import { ZodValidationPipe, JwtAuthGuard, AuthenticatedUser, Public } from '@shared';

@ApiTags('Chat & Messages (Collaboration Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/chats')
export class ChatController {
  constructor(
    private readonly chatUseCase: ChatUseCase,
    private readonly jwtService: JwtService,
  ) {}

  @Get('rooms')
  @ApiOperation({ summary: 'Lấy danh sách phòng chat của người dùng (kèm số tin chưa đọc)' })
  @ApiResponse({ status: 200, description: 'Danh sách phòng chat' })
  async getMyRooms(@Req() req: { user: AuthenticatedUser }) {
    return this.chatUseCase.getMyRooms(req.user.userId);
  }

  @Post('direct-rooms')
  @ApiOperation({ summary: 'Tạo hoặc mở phòng chat trực tiếp 1-1' })
  @ApiResponse({ status: 201, description: 'Phòng chat 1-1' })
  async createDirectRoom(
    @Req() req: { user: AuthenticatedUser },
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.chatUseCase.createDirectRoom(req.user.userId, targetUserId);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({ summary: 'Lấy tin nhắn trong phòng theo seq và cursor (hỗ trợ afterSeq sync khi reconnect)' })
  @ApiResponse({ status: 200, description: 'Danh sách tin nhắn theo thứ tự seq' })
  async getMessages(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
    @Query(new ZodValidationPipe(QueryMessagesDtoSchema)) query: QueryMessagesDto,
  ) {
    return this.chatUseCase.getMessages(roomId, req.user.userId, query);
  }

  @Post('rooms/:id/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn vào phòng chat (atomic seq, clientMsgId dedup, outbox transaction, ACK bền vững)' })
  @ApiResponse({ status: 201, description: 'Tin nhắn đã ghi nhận' })
  async sendMessage(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
    @Body(new ZodValidationPipe(SendMessageDtoSchema)) dto: SendMessageDto,
  ) {
    return this.chatUseCase.sendMessage(roomId, req.user.userId, dto);
  }

  @Post('rooms/:id/read')
  @ApiOperation({ summary: 'Cập nhật trạng thái đã đọc theo lastReadSeq (tăng đơn điệu)' })
  @ApiResponse({ status: 200, description: 'Đã cập nhật vị trí đọc' })
  async markRead(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
    @Body(new ZodValidationPipe(MarkReadDtoSchema)) dto: MarkReadDto,
  ) {
    return this.chatUseCase.markAsRead(roomId, req.user.userId, dto);
  }

  /**
   * EMQX Webhook: Xác thực MQTT Client
   * Password chứa Access Token JWT
   */
  @Public()
  @Post('mqtt/auth')
  @ApiOperation({ summary: 'EMQX Webhook xác thực người dùng (MQTT Authentication)' })
  async mqttAuth(@Body() body: { username?: string; password?: string; clientid?: string }) {
    const token = body.password;
    if (!token) {
      return { result: 'deny' };
    }
    try {
      const payload = this.jwtService.verify<{ sub?: string; userId?: string }>(token);
      const userId = payload.sub || payload.userId;
      if (userId && (!body.username || body.username === userId)) {
        return { result: 'allow', user_id: userId };
      }
      return { result: 'deny' };
    } catch {
      return { result: 'deny' };
    }
  }

  /**
   * EMQX Webhook: Kiểm tra quyền Topic (ACL)
   * Kiểm soát chặt chẽ chỉ cho phép phòng hợp lệ; thu hồi tức thì khi rời đội
   */
  @Public()
  @Post('mqtt/acl')
  @ApiOperation({ summary: 'EMQX Webhook phân quyền truy cập Topic (MQTT ACL: kiểm tra phòng & thu hồi membership)' })
  async mqttAcl(
    @Body() body: { username?: string; clientid?: string; topic?: string; action?: 'subscribe' | 'publish' },
  ) {
    if (!body.username || !body.topic) {
      return { result: 'deny' };
    }
    const check = await this.chatUseCase.validateMqttAcl(
      body.username,
      body.topic,
      body.action || 'subscribe',
    );
    return { result: check.allowed ? 'allow' : 'deny', reason: check.reason };
  }
}
