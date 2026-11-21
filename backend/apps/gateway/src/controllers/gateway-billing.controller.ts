import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard, Public } from '@shared';

const BILLING_URL = () => process.env.BILLING_SERVICE_URL || 'http://localhost:3004';

async function forwardBilling(path: string, options: RequestInit = {}) {
  const url = `${BILLING_URL()}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
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

  @Public()
  @Post('payments/webhook/sandbox')
  @ApiOperation({ summary: 'Webhook mô phỏng thanh toán sandbox' })
  @ApiResponse({ status: 200, description: 'Xử lý webhook thành công' })
  async sandboxWebhook(@Body() body: any) {
    return forwardBilling('/api/v1/payments/webhook/sandbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  @ApiOperation({ summary: 'Mô phỏng thanh toán sandbox thành công (Demo environment)' })
  @ApiResponse({ status: 200, description: 'Cộng tiền vào ví thành công' })
  async simulateSuccess(@Param('id') orderId: string) {
    return forwardBilling(`/api/v1/payments/orders/${orderId}/simulate-success`, {
      method: 'POST',
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
