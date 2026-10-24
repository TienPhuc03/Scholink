import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ChatUseCase } from '../application/use-cases/chat.use-case';
import { SendMessageDto, SendMessageDtoSchema } from '../application/dtos/collaboration.dto';
import { ZodValidationPipe, JwtAuthGuard, AuthenticatedUser } from '@shared';

@ApiTags('Chat & Messages (Collaboration Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/chat')
export class ChatController {
  constructor(private readonly chatUseCase: ChatUseCase) {}

  @Get('rooms')
  @ApiOperation({ summary: 'Lấy danh sách phòng chat của người dùng hiện tại' })
  @ApiResponse({ status: 200, description: 'Danh sách phòng chat' })
  async getMyRooms(@Req() req: { user: AuthenticatedUser }) {
    return this.chatUseCase.getMyRooms(req.user.userId);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn trong phòng chat' })
  @ApiResponse({ status: 200, description: 'Danh sách tin nhắn' })
  async getMessages(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
  ) {
    return this.chatUseCase.getMessages(roomId, req.user.userId);
  }

  @Post('rooms/:id/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn vào phòng chat' })
  @ApiResponse({ status: 201, description: 'Tin nhắn đã gửi' })
  async sendMessage(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') roomId: string,
    @Body(new ZodValidationPipe(SendMessageDtoSchema)) dto: SendMessageDto,
  ) {
    return this.chatUseCase.sendMessage(roomId, req.user.userId, dto);
  }
}
