import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles } from '@shared';

const IDENTITY_URL = () => process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001';

async function forwardIdentity(path: string, options: RequestInit = {}) {
  const url = `${IDENTITY_URL()}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return data;
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
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Lấy danh sách tất cả tổ chức đối tác (Admin Only)' })
  @ApiResponse({ status: 200, description: 'Danh sách tổ chức' })
  async listOrganizations(@Headers('authorization') auth: string) {
    return forwardIdentity('/api/v1/admin/organizations', {
      headers: { Authorization: auth },
    });
  }

  @Post(':id/members')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cấp quyền Organizer cho người dùng vào tổ chức (Admin Only)' })
  @ApiResponse({ status: 201, description: 'Cấp quyền thành công' })
  async addMember(
    @Param('id') orgId: string,
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardIdentity(`/api/v1/admin/organizations/${orgId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }
}
