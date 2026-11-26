import { Controller, Get, Post, Body, Param, Headers, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { WalletUseCase } from '../application/use-cases/wallet.use-case';
import {
  TopupDto,
  TopupDtoSchema,
  PurchaseSkuDto,
  PurchaseSkuDtoSchema,
} from '../application/dtos/billing.dto';
import {
  ZodValidationPipe,
  JwtAuthGuard,
  IdempotencyGuard,
  Idempotent,
  AuthenticatedUser,
  Public,
  DomainException,
  ErrorCode,
} from '@shared';

const assertSandboxAllowed = () => {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new DomainException(
      ErrorCode.FORBIDDEN_RESOURCE,
      'Chức năng thanh toán sandbox đã bị tắt trên môi trường này',
      403,
    );
  }
};

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

  @Post('payments/webhook/sandbox')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Webhook mô phỏng thanh toán sandbox (chỉ bật ở dev/test)' })
  @ApiResponse({ status: 200, description: 'Xử lý webhook thành công' })
  async sandboxWebhook(@Body() body: any) {
    assertSandboxAllowed();
    return this.walletUseCase.handleWebhook('SANDBOX', body);
  }

  @Get('payments/orders/:id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Kiểm tra trạng thái đơn nạp tiền' })
  @ApiResponse({ status: 200, description: 'Trạng thái đơn nạp' })
  async getOrderStatus(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') orderId: string,
  ) {
    return this.walletUseCase.getOrderStatus(orderId, req.user.userId);
  }

  @Post('payments/orders/:id/reconcile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Đối soát trạng thái đơn nạp trực tiếp với PayOS (khôi phục khi webhook chậm/mất)' })
  @ApiResponse({ status: 200, description: 'Kết quả đối soát đơn nạp' })
  async reconcileOrder(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') orderId: string,
  ) {
    return this.walletUseCase.reconcileOrder(orderId, req.user.userId);
  }

  @Post('payments/orders/:id/simulate-success')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mô phỏng thanh toán sandbox thành công (chỉ bật ở dev/test)' })
  @ApiResponse({ status: 200, description: 'Cộng tiền vào ví thành công' })
  async simulateSuccess(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') orderId: string,
  ) {
    assertSandboxAllowed();
    return this.walletUseCase.completeTopupSandbox(orderId, req.user.userId);
  }

  @Get('wallet/entitlements')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách các đặc quyền / gói dịch vụ đang hoạt động của người dùng' })
  @ApiResponse({ status: 200, description: 'Danh sách đặc quyền hoạt động' })
  async getMyEntitlements(@Req() req: { user: AuthenticatedUser }) {
    return this.walletUseCase.getMyEntitlements(req.user.userId);
  }

  @Get('wallet/purchases')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy lịch sử mua gói dịch vụ của người dùng' })
  @ApiResponse({ status: 200, description: 'Lịch sử mua gói' })
  async getMyPurchases(@Req() req: { user: AuthenticatedUser }) {
    return this.walletUseCase.getMyEntitlements(req.user.userId);
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
