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
import { JwtAuthGuard } from '@shared';

const BILLING_URL = () => process.env.BILLING_SERVICE_URL || 'http://localhost:3004';

async function forwardBilling(path: string, options: RequestInit = {}) {
  const url = `${BILLING_URL()}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return data;
}

@ApiTags('Wallet & Billing (Billing Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1')
export class GatewayBillingController {
  @Get('wallet')
  @ApiOperation({ summary: 'Lấy thông tin số dư ví VND (Balance, Held, Available)' })
  @ApiResponse({ status: 200, description: 'Số dư ví' })
  async getMyWallet(@Headers('authorization') auth: string) {
    return forwardBilling('/api/v1/wallet', {
      headers: { Authorization: auth },
    });
  }

  @Post('payments/topups')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Khởi tạo đơn nạp tiền vào ví qua cổng thanh toán' })
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

  @Post('payments/orders/:id/simulate-success')
  @ApiOperation({ summary: 'Mô phỏng thanh toán sandbox thành công (Demo environment)' })
  @ApiResponse({ status: 200, description: 'Cộng tiền vào ví thành công' })
  async simulateSuccess(@Param('id') orderId: string) {
    return forwardBilling(`/api/v1/payments/orders/${orderId}/simulate-success`, {
      method: 'POST',
    });
  }

  @Post('wallet/purchases')
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
