import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { OpportunityUseCase } from '../application/use-cases/opportunity.use-case';
import {
  CreateOpportunityDto,
  CreateOpportunityDtoSchema,
  QueryOpportunityDto,
  QueryOpportunityDtoSchema,
} from '../application/dtos/opportunity.dto';
import {
  ZodValidationPipe,
  Public,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  AuthenticatedUser,
  CorrelationIdInterceptor,
  GrpcExceptionFilter,
} from '@shared';

@ApiTags('Opportunity Catalog (Opportunity Microservice)')
@UseInterceptors(CorrelationIdInterceptor)
@UseFilters(GrpcExceptionFilter)
@Controller('api/v1/opportunities')
export class OpportunityController {
  constructor(private readonly opportunityUseCase: OpportunityUseCase) {}

  // ================= gRPC Handlers =================
  @GrpcMethod('OpportunityGrpcService', 'ListOpportunities')
  async listGrpc(query: QueryOpportunityDto) {
    return this.opportunityUseCase.list(query);
  }

  @GrpcMethod('OpportunityGrpcService', 'GetOpportunityById')
  async getByIdGrpc(data: { id: string }) {
    return this.opportunityUseCase.getById(data.id);
  }

  @GrpcMethod('OpportunityGrpcService', 'CreateOpportunity')
  async createGrpc(
    data: CreateOpportunityDto & { actorId: string; organizationId?: string },
  ) {
    const { actorId, organizationId, ...dto } = data;
    return this.opportunityUseCase.create(dto, actorId, organizationId);
  }

  // ================= HTTP Handlers =================
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Tìm kiếm danh sách học bổng và cuộc thi (cursor-based pagination)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách cơ hội' })
  @ApiResponse({ status: 400, description: 'Tham số bộ lọc không hợp lệ' })
  async list(
    @Query(new ZodValidationPipe(QueryOpportunityDtoSchema))
    query: QueryOpportunityDto,
  ) {
    return this.opportunityUseCase.list(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết học bổng / cuộc thi' })
  @ApiParam({ name: 'id', description: 'ID định danh cơ hội (UUID)' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết cơ hội thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy cơ hội' })
  async getById(@Param('id') id: string) {
    return this.opportunityUseCase.getById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({
    summary: 'Tạo học bổng hoặc cuộc thi mới (Organizer / Admin)',
  })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ (Zod Invariants)',
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực danh tính' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập' })
  async create(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateOpportunityDtoSchema))
    dto: CreateOpportunityDto,
  ) {
    return this.opportunityUseCase.create(dto, req.user.userId, req.user.organizationId);
  }
}
