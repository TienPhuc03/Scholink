import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationUseCase } from '../application/use-cases/organization.use-case';
import {
  CreateOrganizationDto,
  CreateOrganizationDtoSchema,
  AssignOrganizerDto,
  AssignOrganizerDtoSchema,
  RevokeOrganizerDto,
  RevokeOrganizerDtoSchema,
  UpdateOrganizationStatusDto,
  UpdateOrganizationStatusDtoSchema,
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

  @Post(':id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cập nhật trạng thái đơn vị tổ chức (ACTIVE / SUSPENDED) (Admin)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thành công' })
  async updateStatus(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateOrganizationStatusDtoSchema)) dto: UpdateOrganizationStatusDto,
  ) {
    return this.orgUseCase.updateOrganizationStatus(id, req.user.userId, dto);
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

  // SCHOL-14: API thu hồi quyền membership chỉ Admin được thực hiện
  @Post(':id/revoke-organizer')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Thu hồi quyền thành viên của Organizer tại đơn vị tổ chức (Admin)' })
  @ApiResponse({ status: 200, description: 'Thu hồi quyền thành viên thành công' })
  async revokeOrganizer(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RevokeOrganizerDtoSchema)) dto: RevokeOrganizerDto,
  ) {
    return this.orgUseCase.revokeOrganizerMembership(id, req.user.userId, dto);
  }

  @Delete(':id/members/:userId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Xóa quyền thành viên của Organizer tại đơn vị tổ chức (Admin)' })
  @ApiResponse({ status: 200, description: 'Xóa quyền thành viên thành công' })
  async deleteMember(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.orgUseCase.revokeOrganizerMembership(id, req.user.userId, { userId });
  }
}
