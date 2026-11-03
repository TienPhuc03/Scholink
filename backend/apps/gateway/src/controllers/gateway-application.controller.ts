import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader, ApiBody } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import {
  ZodValidationPipe,
  JwtAuthGuard,
  RolesGuard,
  IdempotencyGuard,
  Roles,
  Idempotent,
  AuthenticatedUser,
  CreatePreviewDto,
  CreatePreviewDtoSchema,
  CreateSubmissionIntentDto,
  CreateSubmissionIntentDtoSchema,
  AbortSubmissionIntentDto,
  AbortSubmissionIntentDtoSchema,
  SubmitApplicationDto,
  SubmitApplicationDtoSchema,
  ApplySnapshotRetentionDto,
  ApplySnapshotRetentionDtoSchema,
  EvaluateTestResultLogDto,
  EvaluateTestResultLogDtoSchema,
} from '@shared';
import { GATEWAY_OPPORTUNITY_GRPC, OpportunityGrpcClient } from '../grpc-clients.interface';

const OPPORTUNITY_URL = () => process.env.OPPORTUNITY_SERVICE_URL || 'http://localhost:3002';

async function forwardOpportunity(path: string, options: RequestInit = {}) {
  const url = `${OPPORTUNITY_URL()}${path}`;
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errorMsg = data?.message || data?.error || 'Opportunity Service Error';
      throw new HttpException(data || { message: errorMsg }, res.status);
    }
    return data;
  } catch (err: any) {
    if (err instanceof HttpException) throw err;
    throw new HttpException(
      { message: `Không thể kết nối Opportunity Service: ${err.message}` },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

@ApiTags('Application (Opportunity Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, IdempotencyGuard)
@Controller('api/v1/applications')
export class GatewayApplicationController implements OnModuleInit {
  private opportunityService!: OpportunityGrpcClient;

  constructor(@Inject(GATEWAY_OPPORTUNITY_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.opportunityService =
      this.client.getService<OpportunityGrpcClient>('OpportunityGrpcService');
  }

  @Post('previews')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Tạo bản xem trước (Preview) bất biến TTL 10 phút trước khi xin Consent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', example: 'opp_vinai_scholarship_2026' },
        submissionId: { type: 'string', example: 'sub_test_001' },
        attachmentIds: { type: 'array', items: { type: 'string' }, example: ['asset_cv_nguyen_van_sinh_vien.pdf'] },
        expectedRuleVersion: { type: 'number', example: 1 },
      },
      required: ['opportunityId', 'submissionId', 'expectedRuleVersion'],
    },
  })
  @ApiResponse({ status: 201, description: 'Tạo Preview thành công' })
  async createPreview(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreatePreviewDtoSchema)) dto: CreatePreviewDto,
  ) {
    return firstValueFrom(
      this.opportunityService.createApplicationPreview({
        ...dto,
        studentId: req.user.userId,
      }),
    );
  }

  @Get('previews/:previewId')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Xem lại bản Preview bất biến đã chốt' })
  @ApiResponse({ status: 200, description: 'Nội dung Preview và Manifest tệp' })
  async getPreview(
    @Req() req: { user: AuthenticatedUser },
    @Param('previewId') previewId: string,
  ) {
    return firstValueFrom(
      this.opportunityService.getApplicationPreview({
        studentId: req.user.userId,
        previewId,
      }),
    );
  }

  @Post('intents')
  @Roles('STUDENT')
  @ApiOperation({
    summary: 'F31: Tạo Submission Intent (PENDING) cho phiên nộp hồ sơ đội (WF07 / FR-APP-05)',
  })
  @ApiResponse({ status: 201, description: 'Tạo Submission Intent thành công' })
  async createSubmissionIntent(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateSubmissionIntentDtoSchema)) dto: CreateSubmissionIntentDto,
  ) {
    return firstValueFrom(
      this.opportunityService.createSubmissionIntent({
        ...dto,
        leaderId: req.user.userId,
      }),
    );
  }

  @Post('intents/:submissionId/abort')
  @Roles('STUDENT', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'F31: Hủy nguyên tử Submission Intent (PENDING -> ABORTED, không ghi đè nếu đã COMMITTED)',
  })
  @ApiResponse({ status: 200, description: 'Kết quả xử lý AbortSubmissionIntent' })
  async abortSubmissionIntent(
    @Req() req: { user: AuthenticatedUser },
    @Param('submissionId') submissionId: string,
    @Body(new ZodValidationPipe(AbortSubmissionIntentDtoSchema)) dto: AbortSubmissionIntentDto,
  ) {
    return firstValueFrom(
      this.opportunityService.abortSubmissionIntent({
        submissionId,
        actorId: req.user.userId,
        opportunityId: dto.opportunityId,
        teamId: dto.teamId,
        reason: dto.reason,
      }),
    );
  }

  @Post('retention-decision')
  @Roles('STUDENT', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'F40: Thực thi quyết định giữ hoặc xóa/ẩn danh Snapshot ứng tuyển khi xóa tài khoản (D06 / Mục 29)',
  })
  @ApiResponse({ status: 200, description: 'Kết quả giữ/xóa Snapshot ứng tuyển' })
  async applySnapshotRetentionDecision(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(ApplySnapshotRetentionDtoSchema)) dto: ApplySnapshotRetentionDto,
  ) {
    return firstValueFrom(
      this.opportunityService.applySnapshotRetentionDecision({
        ...dto,
        studentId: req.user.role === 'ADMIN' ? dto.studentId : req.user.userId,
      }),
    );
  }

  @Post('test-results/evaluate')
  @Roles('STUDENT', 'ORGANIZER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'F40: Ghi nhận nhật ký kết quả test & chặn claim đủ AC khi còn NOT_RUN (Mục 30 / NFR11)',
  })
  @ApiResponse({ status: 200, description: 'Kết quả đánh giá nhật ký kiểm thử AC' })
  async evaluateTestResultLog(
    @Body(new ZodValidationPipe(EvaluateTestResultLogDtoSchema)) dto: EvaluateTestResultLogDto,
  ) {
    return firstValueFrom(this.opportunityService.evaluateTestResultLog(dto));
  }

  // =========================================================================
  // SCHOL-14: ORGANIZER KANBAN, DETAIL, ATTACHMENTS & STATUS MANAGEMENT
  // =========================================================================
  @Get('organizer/kanban/:opportunityId')
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Organizer xem danh sách hồ sơ theo cột Kanban (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Dữ liệu Kanban' })
  async getOpportunityKanban(
    @Headers('authorization') auth: string,
    @Param('opportunityId') opportunityId: string,
  ) {
    return forwardOpportunity(`/api/v1/applications/organizer/kanban/${opportunityId}`, {
      headers: { Authorization: auth },
    });
  }

  @Get('organizer/:id')
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Organizer xem chi tiết hồ sơ ứng tuyển (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Chi tiết hồ sơ' })
  async getApplicationDetail(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    return forwardOpportunity(`/api/v1/applications/organizer/${id}`, {
      headers: { Authorization: auth },
    });
  }

  @Get('organizer/:id/attachments')
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Organizer xem danh sách tệp đính kèm của hồ sơ (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Danh sách tệp đính kèm' })
  async getApplicationAttachments(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    return forwardOpportunity(`/api/v1/applications/organizer/${id}/attachments`, {
      headers: { Authorization: auth },
    });
  }

  @Post()
  @Roles('STUDENT')
  @Idempotent()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID chống gửi trùng lệnh nộp hồ sơ (TTL 24h)',
  })
  @ApiOperation({
    summary: 'Nộp hồ sơ ứng tuyển (Cá nhân hoặc Đội) từ đúng Snapshot trong Preview & Consent hợp lệ',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', example: 'opp_vinai_scholarship_2026' },
        submissionId: { type: 'string', example: 'sub_test_001' },
        submissionType: { type: 'string', enum: ['INDIVIDUAL', 'TEAM'], example: 'INDIVIDUAL' },
        teamId: { type: 'string', example: 'team_hackathon_01' },
        rosterVersion: { type: 'number', example: 1 },
        reservationId: { type: 'string', example: 'res_001' },
        fencingToken: { type: 'number', example: 1 },
        memberConsents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              studentId: { type: 'string' },
              previewId: { type: 'string' },
              snapshotId: { type: 'string' },
              profileVersion: { type: 'number' },
              payloadHash: { type: 'string' },
              consentId: { type: 'string' },
            },
          },
        },
        previewId: { type: 'string', example: 'prv_replace_with_actual_preview_id' },
        snapshotId: { type: 'string', example: 'snap_replace_with_actual_snapshot_id' },
        profileVersion: { type: 'number', example: 2 },
        expectedRuleVersion: { type: 'number', example: 1 },
        payloadHash: { type: 'string', example: 'hash_replace_with_actual_payload_hash' },
        consentId: { type: 'string', example: 'consent_replace_with_actual_consent_id' },
      },
      required: ['opportunityId', 'submissionType', 'expectedRuleVersion'],
    },
  })
  @ApiResponse({ status: 201, description: 'Nộp hồ sơ thành công' })
  async submit(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(SubmitApplicationDtoSchema)) dto: SubmitApplicationDto,
  ) {
    return firstValueFrom(
      this.opportunityService.submitApplication({
        ...dto,
        studentId: req.user.userId,
      }),
    );
  }

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Danh sách các hồ sơ ứng tuyển của sinh viên hiện tại' })
  @ApiResponse({ status: 200, description: 'Danh sách hồ sơ đã nộp' })
  async getMyApplications(@Req() req: { user: AuthenticatedUser }) {
    const res = await firstValueFrom(
      this.opportunityService.getMyApplications({ studentId: req.user.userId }),
    );
    return res.items ?? [];
  }

  @Get(':id')
  @Roles('STUDENT')
  @ApiOperation({
    summary: 'Xem chi tiết hồ sơ ứng tuyển kèm lịch sử Revisions bất biến và Events (FR-APP-03 / FR-APP-08)',
  })
  @ApiResponse({ status: 200, description: 'Chi tiết hồ sơ ứng tuyển và lịch sử revisions' })
  async getApplicationById(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.opportunityService.getApplicationById({
        applicationId: id,
        studentId: req.user.userId,
      }),
    );
  }

  @Post(':id/withdraw')
  @Roles('STUDENT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rút hồ sơ ứng tuyển trước hạn (có thể nộp lại thành revision mới)' })
  @ApiResponse({ status: 200, description: 'Rút hồ sơ thành công' })
  async withdraw(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return firstValueFrom(
      this.opportunityService.withdrawApplication({
        applicationId: id,
        studentId: req.user.userId,
      }),
    );
  }

  @Patch(':id/status')
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Organizer chuyển trạng thái hồ sơ kèm expectedVersion & lý do khi từ chối (SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thành công' })
  async updateStatus(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return forwardOpportunity(`/api/v1/applications/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }
}
