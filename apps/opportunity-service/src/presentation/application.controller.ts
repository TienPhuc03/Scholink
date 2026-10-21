import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApplicationUseCase } from '../application/use-cases/application.use-case';
import {
  SubmitApplicationDto,
  SubmitApplicationDtoSchema,
  UpdateApplicationStatusDto,
  UpdateApplicationStatusDtoSchema,
} from '../application/dtos/opportunity.dto';
import { ZodValidationPipe, JwtAuthGuard, RolesGuard, IdempotencyGuard, Roles, Idempotent, AuthenticatedUser } from '@shared';

@ApiTags('Application (Opportunity Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, IdempotencyGuard)
@Controller('api/v1/applications')
export class ApplicationController {
  constructor(private readonly applicationUseCase: ApplicationUseCase) {}

  @Post()
  @Roles('STUDENT')
  @Idempotent()
  @ApiOperation({ summary: 'Nộp hồ sơ ứng tuyển học bổng / cuộc thi (yêu cầu Idempotency-Key & Consent)' })
  @ApiResponse({ status: 201, description: 'Nộp hồ sơ thành công' })
  async submit(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(SubmitApplicationDtoSchema)) dto: SubmitApplicationDto,
  ) {
    return this.applicationUseCase.submit(req.user.userId, dto);
  }

  @Get('me')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Lấy danh sách các hồ sơ đã nộp của sinh viên hiện tại' })
  @ApiResponse({ status: 200, description: 'Danh sách hồ sơ của tôi' })
  async getMyApplications(@Req() req: { user: AuthenticatedUser }) {
    return this.applicationUseCase.getMyApplications(req.user.userId);
  }

  @Post(':id/withdraw')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Rút hồ sơ ứng tuyển trước hạn' })
  @ApiResponse({ status: 200, description: 'Rút hồ sơ thành công' })
  async withdraw(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.applicationUseCase.withdraw(id, req.user.userId);
  }

  // ==========================================
  // F24: ORGANIZER KANBAN & STATUS MANAGEMENT
  // ==========================================
  @Get('organizer/kanban/:opportunityId')
  @Roles('ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Lấy danh sách hồ sơ theo các cột Kanban của cuộc thi / học bổng' })
  @ApiResponse({ status: 200, description: 'Dữ liệu Kanban' })
  async getOpportunityKanban(
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.applicationUseCase.getOpportunityKanban(opportunityId);
  }

  @Patch(':id/status')
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
