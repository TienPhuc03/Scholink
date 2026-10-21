import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationUseCase } from '../application/use-cases/organization.use-case';
import {
  CreateOrganizationDto,
  CreateOrganizationDtoSchema,
  AssignOrganizerDto,
  AssignOrganizerDtoSchema,
} from '../application/dtos/organization.dto';
import { ZodValidationPipe, JwtAuthGuard, RolesGuard, Roles, AuthenticatedUser } from '@shared';

@ApiTags('Admin Organization (Identity Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/admin/organizations')
export class AdminOrganizationController {
  constructor(private readonly orgUseCase: OrganizationUseCase) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Tạo đơn vị tổ chức mới (Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo đơn vị thành công' })
  async createOrganization(
    @Body(new ZodValidationPipe(CreateOrganizationDtoSchema)) dto: CreateOrganizationDto,
  ) {
    return this.orgUseCase.createOrganization(dto);
  }

  @Get()
  @Roles('ADMIN', 'ORGANIZER')
  @ApiOperation({ summary: 'Lấy danh sách các đơn vị tổ chức' })
  @ApiResponse({ status: 200, description: 'Danh sách đơn vị tổ chức' })
  async listOrganizations() {
    return this.orgUseCase.listOrganizations();
  }

  @Get(':id')
  @Roles('ADMIN', 'ORGANIZER')
  @ApiOperation({ summary: 'Xem chi tiết đơn vị tổ chức kèm danh sách thành viên' })
  @ApiResponse({ status: 200, description: 'Chi tiết đơn vị' })
  async getOrganizationById(@Param('id') id: string) {
    return this.orgUseCase.getOrganizationById(id);
  }

  @Post(':id/assign-organizer')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cấp quyền Organizer và gán vào đơn vị tổ chức (Admin)' })
  @ApiResponse({ status: 200, description: 'Gán Organizer thành công' })
  async assignOrganizer(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AssignOrganizerDtoSchema)) dto: AssignOrganizerDto,
  ) {
    return this.orgUseCase.assignOrganizer(id, req.user.userId, dto);
  }
}
