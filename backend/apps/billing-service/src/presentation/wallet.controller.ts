import { Controller, Get, Post, Body, Param, Headers, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { WalletUseCase } from '../application/use-cases/wallet.use-case';
import {
  TopupDto,
  TopupDtoSchema,
  PurchaseSkuDto,
  PurchaseSkuDtoSchema,
} from '../application/dtos/billing.dto';
import { ZodValidationPipe, JwtAuthGuard, IdempotencyGuard, Idempotent, AuthenticatedUser, Public } from '@shared';

@ApiTags('Wallet & Billing (Billing Microservice)')
@Controller('api/v1')
export class WalletController {
  constructor(private readonly walletUseCase: WalletUseCase) {}

  @Get('wallet')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin số dư ví (Balance, Held, Available)' })
  @ApiResponse({ status: 200, description: 'Số dư ví' })
  async getMyWallet(@Req() req: { user: AuthenticatedUser }) {
    return this.walletUseCase.getMyWallet(req.user.userId);
  }

  @Post('payments/topups')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, IdempotencyGuard)
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Khởi tạo đơn nạp tiền vào ví qua cổng thanh toán (PayOS VietQR / Sandbox)' })
  @ApiResponse({ status: 201, description: 'Tạo đơn nạp thành công' })
  async createTopup(
    @Req() req: { user: AuthenticatedUser },
    @Headers('idempotency-key') idempotencyKey: string,
    @Body(new ZodValidationPipe(TopupDtoSchema)) dto: TopupDto,
  ) {
    return this.walletUseCase.createTopupOrder(req.user.userId, dto, idempotencyKey);
  }

  @Public()
  @Post('payments/webhook/payos')
  @ApiOperation({ summary: 'Webhook nhận thông báo thanh toán tự động từ PayOS' })
  @ApiResponse({ status: 200, description: 'Xử lý webhook thành công' })
  async payosWebhook(@Body() body: any) {
    return this.walletUseCase.handleWebhook('PAYOS', body);
  }

  @Public()
  @Post('payments/webhook/sandbox')
  @ApiOperation({ summary: 'Webhook mô phỏng thanh toán sandbox' })
  @ApiResponse({ status: 200, description: 'Xử lý webhook thành công' })
  async sandboxWebhook(@Body() body: any) {
    return this.walletUseCase.handleWebhook('SANDBOX', body);
  }

  @Get('payments/orders/:id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Kiểm tra trạng thái đơn nạp tiền' })
  @ApiResponse({ status: 200, description: 'Trạng thái đơn nạp' })
  async getOrderStatus(@Param('id') orderId: string) {
    return this.walletUseCase.getOrderStatus(orderId);
  }

  @Public()
  @Post('payments/orders/:id/simulate-success')
  @ApiOperation({ summary: 'Mô phỏng thanh toán sandbox thành công (Demo environment)' })
  @ApiResponse({ status: 200, description: 'Cộng tiền vào ví thành công' })
  async simulateSuccess(@Param('id') orderId: string) {
    return this.walletUseCase.completeTopupSandbox(orderId);
  }

  @Post('wallet/purchases')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, IdempotencyGuard)
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Mua gói dịch vụ / tính năng (Plus, Boost, Badge)' })
  @ApiResponse({ status: 200, description: 'Mua thành công' })
  async purchaseSku(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(PurchaseSkuDtoSchema)) dto: PurchaseSkuDto,
  ) {
    return this.walletUseCase.purchaseSku(req.user.userId, dto);
  }
}
