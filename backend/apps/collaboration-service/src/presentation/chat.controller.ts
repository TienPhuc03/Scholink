import { Controller, Get, Post, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ChatUseCase } from '../application/use-cases/chat.use-case';
import {
  SendMessageDto,
  SendMessageDtoSchema,
  QueryMessagesDto,
  QueryMessagesDtoSchema,
  MarkReadDto,
  MarkReadDtoSchema,
} from '../application/dtos/collaboration.dto';
import { ZodValidationPipe, JwtAuthGuard, AuthenticatedUser } from '@shared';

@ApiTags('Chat & Messages (Collaboration Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/chats')
export class ChatController {
  constructor(private readonly chatUseCase: ChatUseCase) {}

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
  @ApiOperation({ summary: 'Lấy tin nhắn trong phòng theo seq và cursor (hỗ trợ afterSeq sync)' })
  @ApiResponse({ status: 200, description: 'Danh sách tin nhắn theo thứ tự seq' })
  async getMessages(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
    @Query(new ZodValidationPipe(QueryMessagesDtoSchema)) query: QueryMessagesDto,
  ) {
    return this.chatUseCase.getMessages(roomId, req.user.userId, query);
  }

  @Post('rooms/:id/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn vào phòng chat (atomic seq, clientMsgId dedup, outbox)' })
  @ApiResponse({ status: 201, description: 'Tin nhắn đã ghi nhận' })
  async sendMessage(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
    @Body(new ZodValidationPipe(SendMessageDtoSchema)) dto: SendMessageDto,
  ) {
    return this.chatUseCase.sendMessage(roomId, req.user.userId, dto);
  }

  @Post('rooms/:id/read')
  @ApiOperation({ summary: 'Cập nhật trạng thái đã đọc theo lastReadSeq' })
  @ApiResponse({ status: 200, description: 'Đã cập nhật đã đọc' })
  async markRead(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
    @Body(new ZodValidationPipe(MarkReadDtoSchema)) dto: MarkReadDto,
  ) {
    return this.chatUseCase.markAsRead(roomId, req.user.userId, dto);
  }
}
