import { Controller, Get, Post, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OpportunityUseCase } from '../application/use-cases/opportunity.use-case';
import {
  CreateOpportunityDto,
  CreateOpportunityDtoSchema,
  QueryOpportunityDto,
  QueryOpportunityDtoSchema,
} from '../application/dtos/opportunity.dto';
import { ZodValidationPipe, Public, JwtAuthGuard, RolesGuard, Roles, AuthenticatedUser } from '@shared';

@ApiTags('Opportunity Catalog (Opportunity Microservice)')
@Controller('api/v1/opportunities')
export class OpportunityController {
  constructor(private readonly opportunityUseCase: OpportunityUseCase) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Tìm kiếm danh sách học bổng và cuộc thi (cursor-based pagination)' })
  @ApiResponse({ status: 200, description: 'Danh sách cơ hội' })
  async list(
    @Query(new ZodValidationPipe(QueryOpportunityDtoSchema)) query: QueryOpportunityDto,
  ) {
    return this.opportunityUseCase.list(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết học bổng / cuộc thi' })
  @ApiResponse({ status: 200, description: 'Chi tiết cơ hội' })
  async getById(@Param('id') id: string) {
    return this.opportunityUseCase.getById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Tạo học bổng hoặc cuộc thi mới (Organizer / Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  async create(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateOpportunityDtoSchema)) dto: CreateOpportunityDto,
  ) {
    return this.opportunityUseCase.create(dto, req.user.userId);
  }
}
