import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
  Public,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  AuthenticatedUser,
  CreateOpportunityDto,
  CreateOpportunityDtoSchema,
  QueryOpportunityDto,
  QueryOpportunityDtoSchema,
} from '@shared';
import { GATEWAY_OPPORTUNITY_GRPC, OpportunityGrpcClient } from '../grpc-clients.interface';

@ApiTags('Opportunity Catalog (Opportunity Service)')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/opportunities')
export class GatewayOpportunityController implements OnModuleInit {
  private opportunityService!: OpportunityGrpcClient;

  constructor(@Inject(GATEWAY_OPPORTUNITY_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.opportunityService =
      this.client.getService<OpportunityGrpcClient>('OpportunityGrpcService');
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Danh sách học bổng & cuộc thi (Hỗ trợ Chế độ Khách FR-AUTH-01)' })
  @ApiResponse({ status: 200, description: 'Danh sách cơ hội đã công bố' })
  async list(
    @Query(new ZodValidationPipe(QueryOpportunityDtoSchema)) query: QueryOpportunityDto,
  ) {
    const res = await firstValueFrom(this.opportunityService.listOpportunities(query));
    return {
      items: res.items ?? [],
      nextCursor: res.nextCursor ?? null,
      hasMore: Boolean(res.hasMore),
    };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết học bổng / cuộc thi (Hỗ trợ Chế độ Khách FR-AUTH-01)' })
  @ApiResponse({ status: 200, description: 'Chi tiết cơ hội' })
  async getById(@Param('id') id: string) {
    return firstValueFrom(this.opportunityService.getOpportunityById({ id }));
  }

  @Post()
  @ApiBearerAuth()
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Tạo cơ hội mới (organizationId & createdBy lấy từ Server)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['SCHOLARSHIP', 'COMPETITION'], example: 'SCHOLARSHIP' },
        title: { type: 'string', example: 'Học bổng Khuyến học UIT 2026' },
        description: { type: 'string', example: 'Học bổng phát triển tài năng CNTT' },
        organizerName: { type: 'string', example: 'Quỹ Học bổng UIT' },
        applyMode: { type: 'string', enum: ['IN_APP', 'EXTERNAL'], example: 'IN_APP' },
        registerDeadline: { type: 'string', example: '2026-12-31T23:59:59.000Z' },
        timezone: { type: 'string', example: 'Asia/Ho_Chi_Minh' },
        fundingLevel: { type: 'string', example: 'FULL' },
        tags: { type: 'array', items: { type: 'string' }, example: ['IT', 'Scholarship'] },
      },
      required: ['type', 'title', 'description', 'organizerName', 'applyMode', 'registerDeadline'],
    },
  })
  @ApiResponse({ status: 201, description: 'Tạo cơ hội thành công' })
  async create(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateOpportunityDtoSchema)) dto: CreateOpportunityDto,
  ) {
    return firstValueFrom(
      this.opportunityService.createOpportunity({
        ...dto,
        actorId: req.user.userId,
        actorRole: req.user.role,
        organizationId: req.user.organizationId || req.user.userId,
      }),
    );
  }
}
