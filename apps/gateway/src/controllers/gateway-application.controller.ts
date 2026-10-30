import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
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
  SubmitApplicationDto,
  SubmitApplicationDtoSchema,
} from '@shared';
import { GATEWAY_OPPORTUNITY_GRPC, OpportunityGrpcClient } from '../grpc-clients.interface';

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

  @Post()
  @Roles('STUDENT')
  @Idempotent()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID chống gửi trùng lệnh nộp hồ sơ (TTL 24h)',
  })
  @ApiOperation({ summary: 'Nộp hồ sơ ứng tuyển từ đúng Snapshot trong Preview & Consent hợp lệ' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', example: 'opp_vinai_scholarship_2026' },
        submissionId: { type: 'string', example: 'sub_test_001' },
        submissionType: { type: 'string', enum: ['INDIVIDUAL', 'TEAM'], example: 'INDIVIDUAL' },
        previewId: { type: 'string', example: 'prv_replace_with_actual_preview_id' },
        snapshotId: { type: 'string', example: 'snap_replace_with_actual_snapshot_id' },
        profileVersion: { type: 'number', example: 2 },
        expectedRuleVersion: { type: 'number', example: 1 },
        payloadHash: { type: 'string', example: 'hash_replace_with_actual_payload_hash' },
        consentId: { type: 'string', example: 'consent_replace_with_actual_consent_id' },
      },
      required: [
        'opportunityId',
        'submissionId',
        'submissionType',
        'previewId',
        'snapshotId',
        'profileVersion',
        'expectedRuleVersion',
        'payloadHash',
        'consentId',
      ],
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
}
