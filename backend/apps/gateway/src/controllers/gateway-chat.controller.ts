import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@shared';

const COLLAB_URL = () => process.env.COLLABORATION_SERVICE_URL || 'http://localhost:3003';

async function forwardCollab(path: string, options: RequestInit = {}) {
  const url = `${COLLAB_URL()}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return data;
}

@ApiTags('Chat & Messages (Collaboration Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/chats')
export class GatewayChatController {
  @Get('rooms')
  @ApiOperation({ summary: 'Lấy danh sách phòng chat của người dùng (kèm số tin chưa đọc)' })
  @ApiResponse({ status: 200, description: 'Danh sách phòng chat' })
  async getMyRooms(@Headers('authorization') auth: string) {
    return forwardCollab('/api/v1/chats/rooms', {
      headers: { Authorization: auth },
    });
  }

  @Post('direct-rooms')
  @ApiOperation({ summary: 'Tạo hoặc mở phòng chat trực tiếp 1-1' })
  @ApiResponse({ status: 201, description: 'Phòng chat 1-1' })
  async createDirectRoom(
    @Headers('authorization') auth: string,
    @Body('targetUserId') targetUserId: string,
  ) {
    return forwardCollab('/api/v1/chats/direct-rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({ targetUserId }),
    });
  }

  @Get('rooms/:id/messages')
  @ApiOperation({ summary: 'Lấy tin nhắn trong phòng theo seq và cursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'afterSeq', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Danh sách tin nhắn theo thứ tự seq' })
  async getMessages(
    @Param('id') roomId: string,
    @Headers('authorization') auth: string,
    @Query('limit') limit?: number,
    @Query('afterSeq') afterSeq?: number,
  ) {
    const query = new URLSearchParams();
    if (limit) query.set('limit', String(limit));
    if (afterSeq) query.set('afterSeq', String(afterSeq));
    return forwardCollab(`/api/v1/chats/rooms/${roomId}/messages?${query.toString()}`, {
      headers: { Authorization: auth },
    });
  }

  @Post('rooms/:id/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn vào phòng chat (monotonic seq, deduplication clientMsgId)' })
  @ApiResponse({ status: 201, description: 'Gửi tin nhắn thành công' })
  async sendMessage(
    @Param('id') roomId: string,
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardCollab(`/api/v1/chats/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post('rooms/:id/read')
  @ApiOperation({ summary: 'Đánh dấu đã đọc tin nhắn trong phòng' })
  @ApiResponse({ status: 200, description: 'Đã cập nhật vị trí đọc' })
  async markRead(
    @Param('id') roomId: string,
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardCollab(`/api/v1/chats/rooms/${roomId}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }
}
