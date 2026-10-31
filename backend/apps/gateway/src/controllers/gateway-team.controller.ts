import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  AuthenticatedUser,
  Public,
} from '@shared';

const COLLAB_URL = () => process.env.COLLABORATION_SERVICE_URL || 'http://localhost:3003';

async function forwardCollab(path: string, options: RequestInit = {}) {
  const url = `${COLLAB_URL()}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return data;
}

@ApiTags('Team & Collaboration (Collaboration Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/teams')
export class GatewayTeamController {
  @Post()
  @Roles('STUDENT')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Tạo đội thi mới cho cuộc thi' })
  @ApiResponse({ status: 201, description: 'Tạo đội thành công' })
  async createTeam(
    @Req() req: { user: AuthenticatedUser },
    @Headers('authorization') auth: string,
    @Headers('idempotency-key') idem: string,
    @Body() body: any,
  ) {
    return forwardCollab('/api/v1/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'Idempotency-Key': idem,
      },
      body: JSON.stringify(body),
    });
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết đội thi' })
  @ApiResponse({ status: 200, description: 'Chi tiết đội thi' })
  async getTeamById(@Param('id') id: string) {
    return forwardCollab(`/api/v1/teams/${id}`);
  }

  @Public()
  @Get('competitions/:competitionId')
  @ApiOperation({ summary: 'Lấy danh sách các đội thi của một cuộc thi' })
  @ApiResponse({ status: 200, description: 'Danh sách đội' })
  async getCompetitionTeams(@Param('competitionId') competitionId: string) {
    return forwardCollab(`/api/v1/teams/competitions/${competitionId}`);
  }

  @Post(':id/join-requests')
  @Roles('STUDENT')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Gửi yêu cầu xin gia nhập đội thi (JoinRequest)' })
  @ApiResponse({ status: 201, description: 'Đã gửi yêu cầu gia nhập' })
  async sendJoinRequest(
    @Param('id') teamId: string,
    @Headers('authorization') auth: string,
    @Headers('idempotency-key') idem: string,
    @Body() body: any,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/join-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'Idempotency-Key': idem,
      },
      body: JSON.stringify(body),
    });
  }

  @Post(':id/join-requests/:requestId/review')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Trưởng đội duyệt hoặc từ chối yêu cầu gia nhập đội' })
  @ApiResponse({ status: 200, description: 'Đã xử lý yêu cầu' })
  async reviewJoinRequest(
    @Param('id') teamId: string,
    @Param('requestId') requestId: string,
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/join-requests/${requestId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post(':id/transfer-leader')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Chuyển giao quyền đội trưởng cho thành viên khác' })
  @ApiResponse({ status: 200, description: 'Chuyển quyền thành công' })
  async transferLeader(
    @Param('id') teamId: string,
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/transfer-leader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post(':id/consents')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Thành viên ký Consent đồng thuận nộp hồ sơ đội' })
  @ApiResponse({ status: 200, description: 'Ghi nhận Consent thành công' })
  async submitTeamConsent(
    @Param('id') teamId: string,
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/consents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }
}
