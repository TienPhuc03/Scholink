import { Controller, Get, Patch, Body, Param, Req, UseGuards, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApplicationUseCase } from '../application/use-cases/application.use-case';
import {
  CreatePreviewDto,
  CreateSubmissionIntentDto,
  SubmitApplicationDto,
  ApplySnapshotRetentionDto,
  EvaluateTestResultLogDto,
  UpdateApplicationStatusDto,
  UpdateApplicationStatusDtoSchema,
} from '../application/dtos/opportunity.dto';
import {
  ZodValidationPipe,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  AuthenticatedUser,
  GrpcExceptionFilter,
} from '@shared';

@ApiTags('Application (Opportunity Microservice)')
@UseFilters(GrpcExceptionFilter)
@Controller('api/v1/applications')
export class ApplicationController {
  constructor(private readonly applicationUseCase: ApplicationUseCase) {}

  // ================= gRPC Handlers (API Gateway / Collaboration Dispatch — F04, F13, F22, F31, F40, SCHOL-20) =================
  @GrpcMethod('OpportunityGrpcService', 'CreateApplicationPreview')
  async createPreview(data: CreatePreviewDto & { studentId: string }) {
    const { studentId, ...dto } = data;
    return this.applicationUseCase.createPreview(studentId, dto);
  }

  @GrpcMethod('OpportunityGrpcService', 'GetApplicationPreview')
  async getPreview(data: { studentId: string; previewId: string }) {
    return this.applicationUseCase.getPreview(data.studentId, data.previewId);
  }

  @GrpcMethod('OpportunityGrpcService', 'CreateSubmissionIntent')
  async createSubmissionIntent(data: CreateSubmissionIntentDto & { leaderId: string }) {
    const { leaderId, ...dto } = data;
    return this.applicationUseCase.createSubmissionIntent(leaderId, dto);
  }

  @GrpcMethod('OpportunityGrpcService', 'AbortSubmissionIntent')
  async abortSubmissionIntent(data: {
    submissionId?: string;
    actorId?: string;
    opportunityId?: string;
    teamId?: string;
    reservationId?: string;
    fencingToken?: number;
    team_id?: string;
    reservation_id?: string;
    fencing_token?: number;
    reason?: string;
  }) {
    return this.applicationUseCase.abortSubmissionIntent({
      submissionId: data.submissionId,
      actorId: data.actorId,
      opportunityId: data.opportunityId,
      teamId: data.teamId ?? data.team_id,
      reservationId: data.reservationId ?? data.reservation_id,
      fencingToken:
        data.fencingToken !== undefined
          ? Number(data.fencingToken)
          : data.fencing_token !== undefined
            ? Number(data.fencing_token)
            : undefined,
      reason: data.reason,
    });
  }

  @GrpcMethod('OpportunityGrpcService', 'GetSubmissionById')
  async getSubmissionById(data: { submissionId: string }) {
    return this.applicationUseCase.getSubmissionById(data.submissionId);
  }

  @GrpcMethod('OpportunityGrpcService', 'SubmitApplication')
  async submit(data: SubmitApplicationDto & { studentId: string }) {
    const { studentId, ...dto } = data;
    return this.applicationUseCase.submit(studentId, dto);
  }

  @GrpcMethod('OpportunityGrpcService', 'GetMyApplications')
  async getMyApplications(data: { studentId: string }) {
    const items = await this.applicationUseCase.getMyApplications(data.studentId);
    return { items };
  }

  @GrpcMethod('OpportunityGrpcService', 'GetApplicationById')
  async getApplicationById(data: { applicationId: string; studentId: string }) {
    return this.applicationUseCase.getApplicationById(data.applicationId, data.studentId);
  }

  @GrpcMethod('OpportunityGrpcService', 'WithdrawApplication')
  async withdraw(data: { applicationId: string; studentId: string }) {
    return this.applicationUseCase.withdraw(data.applicationId, data.studentId);
  }

  @GrpcMethod('OpportunityGrpcService', 'CheckReadiness')
  async checkReadiness(data: { studentId: string; opportunityId: string }) {
    return this.applicationUseCase.checkReadiness(data.studentId, data.opportunityId);
  }

  @GrpcMethod('OpportunityGrpcService', 'ApplySnapshotRetentionDecision')
  async applySnapshotRetentionDecision(data: ApplySnapshotRetentionDto) {
    return this.applicationUseCase.applySnapshotRetentionDecision(data);
  }

  @GrpcMethod('OpportunityGrpcService', 'EvaluateTestResultLog')
  async evaluateTestResultLog(data: EvaluateTestResultLogDto) {
    return this.applicationUseCase.evaluateTestResultLog(data);
  }

  // ================= HTTP Handlers (SCHOL-14 / F24: Organizer Kanban, Detail, Attachments, Status) =================
  @Get('organizer/kanban/:opportunityId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Lấy danh sách hồ sơ theo các cột Kanban của cuộc thi / học bổng (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Dữ liệu Kanban' })
  async getOpportunityKanban(
    @Req() req: { user: AuthenticatedUser },
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.applicationUseCase.getOpportunityKanban(opportunityId, req.user);
  }

  @Get('organizer/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Xem chi tiết hồ sơ ứng tuyển dành cho Organizer (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Chi tiết hồ sơ' })
  async getApplicationDetail(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.applicationUseCase.getApplicationDetail(id, req.user);
  }

  @Get('organizer/:id/attachments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Lấy danh sách tệp đính kèm của hồ sơ ứng tuyển (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Danh sách tệp đính kèm' })
  async getApplicationAttachments(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.applicationUseCase.getApplicationAttachments(id, req.user);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Organizer cập nhật trạng thái hồ sơ trên Kanban kèm expectedVersion & note (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thành công' })
  async updateStatus(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateApplicationStatusDtoSchema)) dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationUseCase.updateStatus(id, req.user, dto);
  }
}
