import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Headers,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard, Public, DomainException, ErrorCode } from '@shared';

const BILLING_URL = () => process.env.BILLING_SERVICE_URL || 'http://localhost:3004';

const assertSandboxAllowed = () => {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new DomainException(
      ErrorCode.FORBIDDEN_RESOURCE,
      'Chức năng thanh toán sandbox đã bị tắt trên môi trường này',
      403,
    );
  }
};

async function forwardBilling(path: string, options: RequestInit = {}) {
  const url = `${BILLING_URL()}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new HttpException(
      data ?? { error: { code: 'UPSTREAM_ERROR', message: res.statusText } },
      res.status,
    );
  }
  return data;
}

@ApiTags('Wallet & Billing (Billing Service)')
@Controller('api/v1')
export class GatewayBillingController {
  @Get('wallet')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin số dư ví VND (Balance, Held, Available)' })
  @ApiResponse({ status: 200, description: 'Số dư ví' })
  async getMyWallet(@Headers('authorization') auth: string) {
    return forwardBilling('/api/v1/wallet', {
      headers: { Authorization: auth },
    });
  }

  @Post('payments/topups')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Khởi tạo đơn nạp tiền vào ví qua cổng thanh toán (PayOS VietQR / Sandbox)' })
  @ApiResponse({ status: 201, description: 'Tạo đơn nạp thành công' })
  async createTopup(
    @Headers('authorization') auth: string,
    @Headers('idempotency-key') idem: string,
    @Body() body: any,
  ) {
    return forwardBilling('/api/v1/payments/topups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'Idempotency-Key': idem,
      },
      body: JSON.stringify(body),
    });
  }

  @Public()
  @Post('payments/webhook/payos')
  @ApiOperation({ summary: 'Webhook nhận thông báo thanh toán tự động từ PayOS' })
  @ApiResponse({ status: 200, description: 'Xử lý webhook thành công' })
  async payosWebhook(@Body() body: any) {
    return forwardBilling('/api/v1/payments/webhook/payos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  @Post('payments/webhook/sandbox')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Webhook mô phỏng thanh toán sandbox (chỉ bật ở dev/test)' })
  @ApiResponse({ status: 200, description: 'Xử lý webhook thành công' })
  async sandboxWebhook(@Headers('authorization') auth: string, @Body() body: any) {
    assertSandboxAllowed();
    return forwardBilling('/api/v1/payments/webhook/sandbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });
  }

  @Get('payments/orders/:id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Kiểm tra trạng thái đơn nạp tiền' })
  @ApiResponse({ status: 200, description: 'Trạng thái đơn nạp' })
  async getOrderStatus(@Headers('authorization') auth: string, @Param('id') orderId: string) {
    return forwardBilling(`/api/v1/payments/orders/${orderId}/status`, {
      headers: { Authorization: auth },
    });
  }

  @Post('payments/orders/:id/simulate-success')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mô phỏng thanh toán sandbox thành công (chỉ bật ở dev/test)' })
  @ApiResponse({ status: 200, description: 'Cộng tiền vào ví thành công' })
  async simulateSuccess(@Headers('authorization') auth: string, @Param('id') orderId: string) {
    assertSandboxAllowed();
    return forwardBilling(`/api/v1/payments/orders/${orderId}/simulate-success`, {
      method: 'POST',
      headers: { Authorization: auth },
    });
  }

  @Get('wallet/entitlements')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách đặc quyền đang có hiệu lực của người dùng' })
  @ApiResponse({ status: 200, description: 'Danh sách đặc quyền' })
  async getMyEntitlements(@Headers('authorization') auth: string) {
    return forwardBilling('/api/v1/wallet/entitlements', {
      headers: { Authorization: auth },
    });
  }

  @Get('wallet/purchases')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy lịch sử mua gói dịch vụ' })
  @ApiResponse({ status: 200, description: 'Danh sách mua' })
  async getMyPurchases(@Headers('authorization') auth: string) {
    return forwardBilling('/api/v1/wallet/purchases', {
      headers: { Authorization: auth },
    });
  }

  @Post('wallet/purchases')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Mua gói dịch vụ / tính năng (Plus, Boost, Badge)' })
  @ApiResponse({ status: 200, description: 'Mua thành công' })
  async purchaseSku(
    @Headers('authorization') auth: string,
    @Headers('idempotency-key') idem: string,
    @Body() body: any,
  ) {
    return forwardBilling('/api/v1/wallet/purchases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'Idempotency-Key': idem,
      },
      body: JSON.stringify(body),
    });
  }
}
