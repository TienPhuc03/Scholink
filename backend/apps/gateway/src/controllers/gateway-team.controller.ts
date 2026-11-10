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

  @Post(':id/leave')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Rời đội thi' })
  @ApiResponse({ status: 200, description: 'Rời đội thành công' })
  async leaveTeam(
    @Param('id') teamId: string,
    @Headers('authorization') auth: string,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
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

  @Post(':id/reopen')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Mở lại đội thi từ hồ sơ đã rút (Reopen from Withdrawal)' })
  @ApiResponse({ status: 200, description: 'Đã mở lại đội' })
  async reopenTeam(
    @Param('id') teamId: string,
    @Headers('authorization') auth: string,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
    });
  }

  // ==========================================
  // SCHOL-20: ROSTER FREEZE & SUBMISSIONS
  // ==========================================
  @Post(':id/prepare-submission')
  @Roles('STUDENT')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Bắt đầu quy trình nộp hồ sơ đội (Roster Freeze 10 phút & cấp Lease)' })
  @ApiResponse({ status: 201, description: 'Khóa đội và tạo Reservation thành công' })
  async prepareSubmission(
    @Param('id') teamId: string,
    @Headers('authorization') auth: string,
    @Headers('idempotency-key') idem: string,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/prepare-submission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'Idempotency-Key': idem,
      },
    });
  }

  @Get(':id/members/:studentId/profile')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Xem hồ sơ đồng đội: các trường PUBLIC và TEAMMATES (FR-PROF-05)' })
  @ApiResponse({ status: 200, description: 'Hồ sơ đồng đội' })
  async getTeammateProfile(
    @Param('id') teamId: string,
    @Param('studentId') studentId: string,
    @Headers('authorization') auth: string,
  ) {
    return forwardCollab(`/api/v1/teams/${teamId}/members/${studentId}/profile`, {
      method: 'GET',
      headers: { Authorization: auth },
    });
  }

  @Get(':id/submission')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Xem phiên nộp hồ sơ đội đang mở: ai đã đồng ý, hạn khoá đội (F37)' })
  @ApiResponse({ status: 200, description: 'Trạng thái phiên nộp' })
  async getActiveSubmission(@Param('id') teamId: string, @Headers('authorization') auth: string) {
    return forwardCollab(`/api/v1/teams/${teamId}/submission`, {
      method: 'GET',
      headers: { Authorization: auth },
    });
  }

  @Post(':id/consents')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Thành viên ký Consent đồng thuận nộp hồ sơ đội qua teamId' })
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

  @Post('submissions/:reservationId/consents')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Thành viên ký Consent đồng thuận nộp hồ sơ đội qua reservationId' })
  @ApiResponse({ status: 200, description: 'Ghi nhận Consent thành công' })
  async submitTeamConsentByReservation(
    @Param('reservationId') reservationId: string,
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardCollab(`/api/v1/teams/submissions/${reservationId}/consents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post('submissions/:reservationId/confirm')
  @Roles('STUDENT', 'ADMIN')
  @ApiOperation({ summary: 'Xác nhận nộp hồ sơ đội hoàn tất' })
  @ApiResponse({ status: 200, description: 'Hoàn tất nộp hồ sơ đội' })
  async confirmSubmission(
    @Param('reservationId') reservationId: string,
    @Headers('authorization') auth: string,
  ) {
    return forwardCollab(`/api/v1/teams/submissions/${reservationId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
    });
  }

  @Post('submissions/:reservationId/abort')
  @Roles('STUDENT', 'ADMIN')
  @ApiOperation({ summary: 'Hủy phiên nộp hồ sơ đội và giải phóng khóa Roster Freeze' })
  @ApiResponse({ status: 200, description: 'Đã hủy phiên nộp và mở khóa đội' })
  async abortSubmission(
    @Param('reservationId') reservationId: string,
    @Headers('authorization') auth: string,
  ) {
    return forwardCollab(`/api/v1/teams/submissions/${reservationId}/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
    });
  }
}
