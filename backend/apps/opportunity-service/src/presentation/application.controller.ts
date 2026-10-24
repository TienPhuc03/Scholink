import { Controller, Get, Patch, Body, Param, Req, UseGuards, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApplicationUseCase } from '../application/use-cases/application.use-case';
import {
  CreatePreviewDto,
  SubmitApplicationDto,
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

  // ================= gRPC Handlers (API Gateway Dispatch) =================
  @GrpcMethod('OpportunityGrpcService', 'CreateApplicationPreview')
  async createPreview(data: CreatePreviewDto & { studentId: string }) {
    const { studentId, ...dto } = data;
    return this.applicationUseCase.createPreview(studentId, dto);
  }

  @GrpcMethod('OpportunityGrpcService', 'GetApplicationPreview')
  async getPreview(data: { studentId: string; previewId: string }) {
    return this.applicationUseCase.getPreview(data.studentId, data.previewId);
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

  @GrpcMethod('OpportunityGrpcService', 'WithdrawApplication')
  async withdraw(data: { applicationId: string; studentId: string }) {
    return this.applicationUseCase.withdraw(data.applicationId, data.studentId);
  }

  // ================= HTTP Handlers (F24: Organizer Kanban) =================
  @Get('organizer/kanban/:opportunityId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Lấy danh sách hồ sơ theo các cột Kanban của cuộc thi / học bổng' })
  @ApiResponse({ status: 200, description: 'Dữ liệu Kanban' })
  async getOpportunityKanban(@Param('opportunityId') opportunityId: string) {
    return this.applicationUseCase.getOpportunityKanban(opportunityId);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Organizer cập nhật trạng thái hồ sơ trên Kanban kèm expectedVersion' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thành công' })
  async updateStatus(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateApplicationStatusDtoSchema)) dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationUseCase.updateStatus(id, req.user.userId, dto);
  }
}
