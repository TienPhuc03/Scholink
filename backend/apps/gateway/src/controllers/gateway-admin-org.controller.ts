import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles } from '@shared';

const IDENTITY_URL = () => process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001';

async function forwardIdentity(path: string, options: RequestInit = {}) {
  const url = `${IDENTITY_URL()}${path}`;
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errorMsg = data?.message || data?.error || 'Identity Service Error';
      throw new HttpException(data || { message: errorMsg }, res.status);
    }
    return data;
  } catch (err: any) {
    if (err instanceof HttpException) throw err;
    throw new HttpException(
      { message: `Không thể kết nối Identity Service: ${err.message}` },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

@ApiTags('Admin Organizations (Identity Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/admin/organizations')
export class GatewayAdminOrgController {
  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Tạo tổ chức đối tác mới (Admin Only)' })
  @ApiResponse({ status: 201, description: 'Tạo tổ chức thành công' })
  async createOrganization(
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardIdentity('/api/v1/admin/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Get()
  @Roles('ADMIN', 'ORGANIZER')
  @ApiOperation({ summary: 'Lấy danh sách tất cả tổ chức đối tác' })
  @ApiResponse({ status: 200, description: 'Danh sách tổ chức' })
  async listOrganizations(@Headers('authorization') auth: string) {
    return forwardIdentity('/api/v1/admin/organizations', {
      headers: { Authorization: auth },
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'ORGANIZER')
  @ApiOperation({ summary: 'Xem chi tiết đơn vị tổ chức kèm danh sách thành viên' })
  @ApiResponse({ status: 200, description: 'Chi tiết đơn vị' })
  async getOrganizationById(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    return forwardIdentity(`/api/v1/admin/organizations/${id}`, {
      headers: { Authorization: auth },
    });
  }

  @Post(':id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cập nhật trạng thái đơn vị tổ chức (ACTIVE / SUSPENDED) (Admin Only - SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thành công' })
  async updateStatus(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return forwardIdentity(`/api/v1/admin/organizations/${id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post(':id/assign-organizer')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cấp quyền Organizer và gán vào đơn vị tổ chức (Admin Only - SCHOL-14)' })
  @ApiResponse({ status: 201, description: 'Cấp quyền thành công' })
  async assignOrganizer(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return forwardIdentity(`/api/v1/admin/organizations/${id}/assign-organizer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post(':id/revoke-organizer')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Thu hồi quyền thành viên Organizer tại đơn vị tổ chức (Admin Only - SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Thu hồi quyền thành công' })
  async revokeOrganizer(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return forwardIdentity(`/api/v1/admin/organizations/${id}/revoke-organizer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Delete(':id/members/:userId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Xóa quyền thành viên Organizer tại đơn vị tổ chức (Admin Only - SCHOL-14)' })
  @ApiResponse({ status: 200, description: 'Xóa quyền thành công' })
  async deleteMember(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return forwardIdentity(`/api/v1/admin/organizations/${id}/members/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
  }
}
