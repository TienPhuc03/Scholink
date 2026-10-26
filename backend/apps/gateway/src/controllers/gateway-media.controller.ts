import {
  Controller,
  Post,
  Get,
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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import {
  ZodValidationPipe,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  AuthenticatedUser,
  CreateUploadUrlDto,
  CreateUploadUrlDtoSchema,
  CompleteUploadDto,
  CompleteUploadDtoSchema,
} from '@shared';
import { GATEWAY_IDENTITY_GRPC, IdentityGrpcClient } from '../grpc-clients.interface';

@ApiTags('Media Assets (Identity Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/media')
export class GatewayMediaController implements OnModuleInit {
  private identityService!: IdentityGrpcClient;

  constructor(@Inject(GATEWAY_IDENTITY_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.identityService = this.client.getService<IdentityGrpcClient>('IdentityGrpcService');
  }

  @Post('upload-url')
  @Roles('STUDENT', 'ORGANIZER', 'ADMIN')
  @ApiOperation({
    summary: 'FR-PROF-04: Kiểm tra MIME/dung lượng và cấp Presigned Upload URL cho tệp minh chứng',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['AVATAR', 'CV', 'CERTIFICATE', 'ACHIEVEMENT', 'PITCH_VIDEO', 'ATTACHMENT'],
          example: 'CV',
        },
        fileName: { type: 'string', example: 'cv-nguyen-van-sinh-vien.pdf' },
        mimeType: { type: 'string', example: 'application/pdf' },
        sizeBytes: { type: 'number', example: 524288 },
      },
      required: ['category', 'fileName', 'mimeType', 'sizeBytes'],
    },
  })
  @ApiResponse({ status: 201, description: 'Cấp Upload URL thành công (status = UPLOADING)' })
  async createUploadUrl(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateUploadUrlDtoSchema)) dto: CreateUploadUrlDto,
  ) {
    return firstValueFrom(
      this.identityService.createUploadUrl({
        ...dto,
        ownerId: req.user.userId,
      }),
    );
  }

  @Post(':id/complete')
  @Roles('STUDENT', 'ORGANIZER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'FR-PROF-04: Xác nhận tải lên hoàn tất, quét Magic Bytes & mã độc trước khi chuyển sang READY',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fileHeaderHex: {
          type: 'string',
          description: 'Chuỗi hex Magic Bytes đầu tệp (ví dụ 25504446 cho %PDF)',
          example: '255044462d312e37',
        },
        sampleContent: {
          type: 'string',
          description: 'Mẫu nội dung văn bản trích xuất để quét EICAR / Embedded Script',
          example: '%PDF-1.7 Clean Academic CV Document',
        },
        actualSizeBytes: {
          type: 'number',
          example: 524288,
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Tệp an toàn, đã chuyển sang trạng thái READY' })
  async completeUpload(
    @Param('id') assetId: string,
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CompleteUploadDtoSchema)) dto: CompleteUploadDto,
  ) {
    return firstValueFrom(
      this.identityService.completeUpload({
        ...dto,
        assetId,
        ownerId: req.user.userId,
      }),
    );
  }

  @Get(':id')
  @Roles('STUDENT', 'ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Lấy thông tin tệp minh chứng (chỉ chủ sở hữu mới được xem)' })
  @ApiResponse({ status: 200, description: 'Thông tin MediaAsset' })
  async getMediaAsset(
    @Param('id') assetId: string,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return firstValueFrom(
      this.identityService.getMediaAsset({
        assetId,
        ownerId: req.user.userId,
      }),
    );
  }
}
