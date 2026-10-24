import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Req,
  Inject,
  OnModuleInit,
  UseGuards,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import {
  ZodValidationPipe,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  AuthenticatedUser,
  UpdatePassportDto,
  UpdatePassportDtoSchema,
  CreateConsentDto,
  CreateConsentDtoSchema,
} from '@shared';
import { GATEWAY_IDENTITY_GRPC, IdentityGrpcClient } from '../grpc-clients.interface';

@ApiTags('Profile & Passport (Identity Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/profiles')
export class GatewayProfileController implements OnModuleInit {
  private identityService!: IdentityGrpcClient;

  constructor(@Inject(GATEWAY_IDENTITY_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.identityService = this.client.getService<IdentityGrpcClient>('IdentityGrpcService');
  }

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Lấy Passport của sinh viên đang đăng nhập (owner lấy từ token)' })
  @ApiResponse({ status: 200, description: 'Thông tin Passport' })
  async getMyPassport(@Req() req: { user: AuthenticatedUser }) {
    return firstValueFrom(
      this.identityService.getMyPassport({ studentId: req.user.userId }),
    );
  }

  @Put('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Cập nhật Passport bất biến và tính lại điểm hoàn thiện 7 thành phần' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        expectedVersion: {
          type: 'number',
          description: 'Phiên bản Passport hiện tại để kiểm tra Optimistic Concurrency (tùy chọn)',
          example: 1,
        },
        fullName: { type: 'string', example: 'Nguyễn Văn Sinh Viên' },
        bio: { type: 'string', example: 'Sinh viên đam mê AI và Công nghệ phần mềm' },
        regionCode: { type: 'string', example: 'VN-SG' },
        avatarAssetId: { type: 'string', example: 'asset_avatar_001' },
        education: {
          type: 'object',
          properties: {
            institution: { type: 'string', example: 'Đại học Bách Khoa TP.HCM' },
            major: { type: 'string', example: 'Khoa học Máy tính' },
            startYear: { type: 'number', example: 2023 },
            gpa: { type: 'number', example: 3.82 },
            gpaScale: { type: 'number', example: 4 },
          },
        },
        skills: { type: 'array', items: { type: 'string' }, example: ['Python', 'TypeScript', 'NestJS'] },
        certificates: {
          type: 'array',
          items: { type: 'object' },
          example: [
            {
              type: 'LANGUAGE',
              name: 'IELTS Academic',
              score: '7.5',
              issuedDate: '2025-01-15T00:00:00.000Z',
            },
          ],
        },
        achievements: { type: 'array', items: { type: 'string' }, example: ['Học bổng Khuyến khích Học tập'] },
        cvAssetId: { type: 'string', example: 'asset_cv_nguyen_van_sinh_vien.pdf' },
        isLookingForTeammate: { type: 'boolean', example: true },
        isOpenForScholarship: { type: 'boolean', example: true },
        isOpenForMentoring: { type: 'boolean', example: false },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Cập nhật Passport thành công' })
  async updateMyPassport(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(UpdatePassportDtoSchema)) dto: UpdatePassportDto,
  ) {
    return firstValueFrom(
      this.identityService.updateMyPassport({
        ...dto,
        studentId: req.user.userId,
      }),
    );
  }

  @Post('me/consents')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Tạo Consent xác nhận chia sẻ Snapshot bất biến cho cơ hội' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        opportunityId: { type: 'string', example: 'opp_vinai_scholarship_2026' },
        submissionId: { type: 'string', example: 'sub_test_001' },
        previewId: { type: 'string', example: 'prv_replace_with_actual_preview_id' },
        snapshotId: { type: 'string', example: 'snap_replace_with_actual_snapshot_id' },
        profileVersion: { type: 'number', example: 2 },
        ruleVersion: { type: 'number', example: 1 },
        manifestHash: { type: 'string', example: 'hash_from_preview' },
        payloadHash: { type: 'string', example: 'hash_from_preview' },
      },
      required: [
        'opportunityId',
        'submissionId',
        'previewId',
        'snapshotId',
        'profileVersion',
        'ruleVersion',
        'manifestHash',
        'payloadHash',
      ],
    },
  })
  @ApiResponse({ status: 201, description: 'Tạo Consent thành công' })
  async createConsent(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateConsentDtoSchema)) dto: CreateConsentDto,
  ) {
    return firstValueFrom(
      this.identityService.createConsent({
        ...dto,
        studentId: req.user.userId,
      }),
    );
  }
}
