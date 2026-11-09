import { Controller, Get, Post, Body, Param, Headers, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { WalletUseCase } from '../application/use-cases/wallet.use-case';
import {
  TopupDto,
  TopupDtoSchema,
  PurchaseSkuDto,
  PurchaseSkuDtoSchema,
} from '../application/dtos/billing.dto';
import { ZodValidationPipe, JwtAuthGuard, IdempotencyGuard, Idempotent, AuthenticatedUser } from '@shared';

@ApiTags('Wallet & Billing (Billing Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, IdempotencyGuard)
@Controller('api/v1')
export class WalletController {
  constructor(private readonly walletUseCase: WalletUseCase) {}

  @Get('wallet')
  @ApiOperation({ summary: 'Lấy thông tin số dư ví (Balance, Held, Available)' })
  @ApiResponse({ status: 200, description: 'Số dư ví' })
  async getMyWallet(@Req() req: { user: AuthenticatedUser }) {
    return this.walletUseCase.getMyWallet(req.user.userId);
  }

  @Post('payments/topups')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Khởi tạo đơn nạp tiền vào ví qua cổng thanh toán' })
  @ApiResponse({ status: 201, description: 'Tạo đơn nạp thành công' })
  async createTopup(
    @Req() req: { user: AuthenticatedUser },
    @Headers('idempotency-key') idempotencyKey: string,
    @Body(new ZodValidationPipe(TopupDtoSchema)) dto: TopupDto,
  ) {
    return this.walletUseCase.createTopupOrder(req.user.userId, dto, idempotencyKey);
  }

  @Post('payments/orders/:id/simulate-success')
  @ApiOperation({ summary: 'Mô phỏng thanh toán sandbox thành công (Demo environment)' })
  @ApiResponse({ status: 200, description: 'Cộng tiền vào ví thành công' })
  async simulateSuccess(@Param('id') orderId: string) {
    return this.walletUseCase.completeTopupSandbox(orderId);
  }

  @Post('wallet/purchases')
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
