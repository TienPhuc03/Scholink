import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TeamUseCase } from '../application/use-cases/team.use-case';
import {
  CreateTeamDto,
  CreateTeamDtoSchema,
  CreateJoinRequestDto,
  CreateJoinRequestDtoSchema,
  ReviewJoinRequestDto,
  ReviewJoinRequestDtoSchema,
  TransferLeaderDto,
  TransferLeaderDtoSchema,
  SubmitTeamConsentDto,
  SubmitTeamConsentDtoSchema,
} from '../application/dtos/collaboration.dto';
import { ZodValidationPipe, JwtAuthGuard, RolesGuard, IdempotencyGuard, Roles, Idempotent, AuthenticatedUser, Public } from '@shared';

@ApiTags('Team & Collaboration (Collaboration Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, IdempotencyGuard)
@Controller('api/v1/teams')
export class TeamController {
  constructor(private readonly teamUseCase: TeamUseCase) {}

  @Post()
  @Roles('STUDENT')
  @Idempotent()
  @ApiOperation({ summary: 'Tạo đội thi mới cho cuộc thi' })
  @ApiResponse({ status: 201, description: 'Tạo đội thành công' })
  async createTeam(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateTeamDtoSchema)) dto: CreateTeamDto,
  ) {
    return this.teamUseCase.createTeam(req.user.userId, dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết đội thi' })
  @ApiResponse({ status: 200, description: 'Chi tiết đội thi' })
  async getTeamById(@Param('id') id: string) {
    return this.teamUseCase.getTeamById(id);
  }

  @Public()
  @Get('competitions/:competitionId')
  @ApiOperation({ summary: 'Lấy danh sách các đội thi của một cuộc thi' })
  @ApiResponse({ status: 200, description: 'Danh sách đội' })
  async getCompetitionTeams(@Param('competitionId') competitionId: string) {
    return this.teamUseCase.getCompetitionTeams(competitionId);
  }

  @Post(':id/join-requests')
  @Roles('STUDENT')
  @Idempotent()
  @ApiOperation({ summary: 'Gửi yêu cầu xin gia nhập đội thi (JoinRequest)' })
  @ApiResponse({ status: 201, description: 'Đã gửi yêu cầu gia nhập' })
  async sendJoinRequest(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
    @Body(new ZodValidationPipe(CreateJoinRequestDtoSchema)) dto: CreateJoinRequestDto,
  ) {
    return this.teamUseCase.sendJoinRequest(teamId, req.user.userId, dto);
  }

  @Get(':id/join-requests')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Lấy danh sách các yêu cầu gia nhập của đội (Trưởng đội)' })
  @ApiResponse({ status: 200, description: 'Danh sách yêu cầu gia nhập' })
  async getJoinRequests(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
  ) {
    return this.teamUseCase.getJoinRequests(teamId, req.user.userId);
  }

  @Post(':id/join-requests/:requestId/review')
  @Roles('STUDENT')
  @Idempotent()
  @ApiOperation({ summary: 'Trưởng đội duyệt hoặc từ chối JoinRequest nguyên tử' })
  @ApiResponse({ status: 200, description: 'Xử lý yêu cầu thành công' })
  async reviewJoinRequest(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
    @Param('requestId') requestId: string,
    @Body(new ZodValidationPipe(ReviewJoinRequestDtoSchema)) dto: ReviewJoinRequestDto,
  ) {
    return this.teamUseCase.reviewJoinRequest(teamId, requestId, req.user.userId, dto);
  }

  @Post('join-requests/:requestId/withdraw')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Ứng viên rút yêu cầu gia nhập đã gửi' })
  @ApiResponse({ status: 200, description: 'Đã rút yêu cầu' })
  async withdrawJoinRequest(
    @Req() req: { user: AuthenticatedUser },
    @Param('requestId') requestId: string,
  ) {
    return this.teamUseCase.withdrawJoinRequest(requestId, req.user.userId);
  }

  @Post(':id/leave')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Rời đội thi' })
  @ApiResponse({ status: 200, description: 'Rời đội thành công' })
  async leaveTeam(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
  ) {
    return this.teamUseCase.leaveTeam(teamId, req.user.userId);
  }

  @Post(':id/transfer-leader')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Chuyển giao vai trò trưởng đội cho thành viên khác' })
  @ApiResponse({ status: 200, description: 'Chuyển quyền thành công' })
  async transferLeader(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
    @Body(new ZodValidationPipe(TransferLeaderDtoSchema)) dto: TransferLeaderDto,
  ) {
    return this.teamUseCase.transferLeader(teamId, req.user.userId, dto);
  }

  // ==========================================
  // F33: ROSTER FREEZE & SUBMISSION RESERVATIONS
  // ==========================================
  @Post(':id/prepare-submission')
  @Roles('STUDENT')
  @Idempotent()
  @ApiOperation({ summary: 'Bắt đầu quy trình nộp hồ sơ đội (Roster Freeze 10 phút & cấp Lease)' })
  @ApiResponse({ status: 201, description: 'Khóa đội và tạo Reservation thành công' })
  async prepareSubmission(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
  ) {
    return this.teamUseCase.prepareSubmission(teamId, req.user.userId);
  }

  @Post('submissions/:reservationId/consents')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Thành viên gửi Consent xác nhận nộp hồ sơ đội với roster hiện tại' })
  @ApiResponse({ status: 200, description: 'Đã ghi nhận Consent' })
  async submitConsent(
    @Req() req: { user: AuthenticatedUser },
    @Param('reservationId') reservationId: string,
    @Body(new ZodValidationPipe(SubmitTeamConsentDtoSchema)) dto: SubmitTeamConsentDto,
  ) {
    return this.teamUseCase.submitTeamConsent(reservationId, req.user.userId, dto);
  }

  @Post('submissions/:reservationId/confirm')
  @Roles('STUDENT', 'ADMIN')
  @ApiOperation({ summary: 'Xác nhận nộp hồ sơ đội hoàn tất (Opportunity service / Worker)' })
  @ApiResponse({ status: 200, description: 'Hoàn tất nộp hồ sơ đội' })
  async confirmSubmission(@Param('reservationId') reservationId: string) {
    return this.teamUseCase.confirmSubmission(reservationId);
  }

  @Post('submissions/:reservationId/abort')
  @Roles('STUDENT', 'ADMIN')
  @ApiOperation({ summary: 'Hủy phiên nộp hồ sơ đội và giải phóng khóa Roster Freeze' })
  @ApiResponse({ status: 200, description: 'Đã hủy phiên nộp và mở khóa đội' })
  async abortSubmission(@Param('reservationId') reservationId: string) {
    return this.teamUseCase.abortSubmission(reservationId);
  }
}
