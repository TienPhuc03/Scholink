import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles, AuthenticatedUser } from '@shared';

const OPPORTUNITY_URL = () => process.env.OPPORTUNITY_SERVICE_URL || 'http://localhost:3002';

async function forwardOpportunity(path: string, options: RequestInit = {}) {
  const url = `${OPPORTUNITY_URL()}${path}`;
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errorMsg = data?.message || data?.error || 'Opportunity Service Error';
      throw new HttpException(data || { message: errorMsg }, res.status);
    }
    return data;
  } catch (err: any) {
    if (err instanceof HttpException) throw err;
    throw new HttpException(
      { message: `Không thể kết nối Opportunity Service: ${err.message}` },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

@ApiTags('Admin Opportunities & Crawler Review (Opportunity Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/admin/opportunities')
export class GatewayAdminOpportunityController {
  @Post('crawl')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Kích hoạt thu thập dữ liệu thủ công từ URL (CRAWL-02)' })
  @ApiResponse({ status: 201, description: 'Kết quả thu thập' })
  async triggerManualCrawl(
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardOpportunity('/api/v1/admin/opportunities/crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post('ingest')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Nhập dữ liệu cơ hội hàng loạt (CRAWL-03)' })
  @ApiResponse({ status: 201, description: 'Kết quả nhập dữ liệu' })
  async ingestItems(
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    return forwardOpportunity('/api/v1/admin/opportunities/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Get('review-queue')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Lấy danh sách hàng chờ kiểm duyệt cơ hội (CRAWL-05)' })
  @ApiResponse({ status: 200, description: 'Danh sách cơ hội chờ duyệt' })
  async getReviewQueue(
    @Headers('authorization') auth: string,
    @Query() query: any,
  ) {
    const params = new URLSearchParams(query).toString();
    return forwardOpportunity(`/api/v1/admin/opportunities/review-queue?${params}`, {
      headers: { Authorization: auth },
    });
  }

  @Get(':id/diff')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'So sánh cơ hội hiện tại với dữ liệu thô gốc hoặc cơ hội mục tiêu (CRAWL-05)' })
  @ApiResponse({ status: 200, description: 'Chi tiết so sánh diff' })
  async getDiff(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Query('targetId') targetId?: string,
  ) {
    const targetQuery = targetId ? `?targetId=${targetId}` : '';
    return forwardOpportunity(`/api/v1/admin/opportunities/${id}/diff${targetQuery}`, {
      headers: { Authorization: auth },
    });
  }

  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Chỉnh sửa cơ hội trong hàng chờ kiểm duyệt (CRAWL-05)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  async updateCandidate(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return forwardOpportunity(`/api/v1/admin/opportunities/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });
  }

  @Post(':id/approve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Duyệt và công bố cơ hội (Kiểm tra bắt buộc đầy đủ schema - CRAWL-05)' })
  @ApiResponse({ status: 200, description: 'Công bố cơ hội thành công' })
  async approveOpportunity(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() body: any,
  ) {
    return forwardOpportunity(`/api/v1/admin/opportunities/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        ...body,
        actorId: req.user?.userId || body?.actorId || 'admin_user',
      }),
    });
  }

  @Post(':id/reject')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Từ chối cơ hội trong hàng chờ (CRAWL-05)' })
  @ApiResponse({ status: 200, description: 'Đã từ chối' })
  async rejectOpportunity(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() body: any,
  ) {
    return forwardOpportunity(`/api/v1/admin/opportunities/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        ...body,
        actorId: req.user?.userId || body?.actorId || 'admin_user',
      }),
    });
  }

  @Post(':id/merge')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gộp cơ hội trùng lặp vào cơ hội đích chuẩn (CRAWL-04, CRAWL-05)' })
  @ApiResponse({ status: 200, description: 'Đã gộp thành công' })
  async mergeOpportunity(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() body: any,
  ) {
    return forwardOpportunity(`/api/v1/admin/opportunities/${id}/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        ...body,
        actorId: req.user?.userId || body?.actorId || 'admin_user',
      }),
    });
  }

  @Post(':id/extend')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Gia hạn hạn đăng ký cơ hội (Phát sự kiện tính lại nhắc nhở - NOTI-02)' })
  @ApiResponse({ status: 200, description: 'Đã gia hạn thành công' })
  async extendDeadline(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() body: any,
  ) {
    return forwardOpportunity(`/api/v1/admin/opportunities/${id}/extend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        ...body,
        actorId: req.user?.userId || body?.actorId || 'admin_user',
      }),
    });
  }
}

