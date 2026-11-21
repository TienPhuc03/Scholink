import { Injectable, Inject, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { IWalletRepository, WALLET_REPOSITORY } from '../../domain/ports/wallet.repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository.port';
import { Wallet } from '../../domain/wallet.entity';
import { PaymentOrder } from '../../domain/payment.entity';
import { TopupDto, PurchaseSkuDto } from '../dtos/billing.dto';
import { DomainException, ErrorCode } from '@shared';
import { PaymentGatewayFactory } from '../../infrastructure/gateways/payment-gateway.factory';

@Injectable()
export class WalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: IWalletRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    @Optional() private readonly gatewayFactory?: PaymentGatewayFactory,
  ) {}

  async getMyWallet(userId: string) {
    let wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      wallet = new Wallet(crypto.randomUUID(), {
        userId,
        balanceVnd: 0,
        heldVnd: 0,
      });
      await this.walletRepo.save(wallet);
    }

    return {
      userId: wallet.userId,
      balanceVnd: wallet.balanceVnd,
      heldVnd: wallet.heldVnd,
      availableVnd: wallet.availableVnd,
    };
  }

  async createTopupOrder(userId: string, dto: TopupDto, idempotencyKey?: string) {
    const orderId = `pay_${crypto.randomUUID()}`;
    // PayOS yêu cầu orderCode dạng số nguyên dương an toàn (tối đa 9007199254740991)
    const orderCode = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 900 + 100);

    const adapter = this.gatewayFactory?.getAdapter(dto.provider);
    const description = `Scholink nap ${dto.amountVnd / 1000}k`;

    let checkoutUrl = `https://sandbox.scholink.vn/checkout/${orderId}`;
    let qrCode = `https://img.vietqr.io/image/970422-SCHOLINK-compact2.png?amount=${dto.amountVnd}&addInfo=${encodeURIComponent(description)}&accountName=SCHOLINK%20ECOSYSTEM`;

    if (adapter) {
      try {
        const paymentRes = await adapter.createPayment({
          orderId,
          orderCode,
          amountVnd: dto.amountVnd,
          description,
        });
        checkoutUrl = paymentRes.checkoutUrl;
        if (paymentRes.qrCode) {
          qrCode = paymentRes.qrCode;
        }
      } catch (err: any) {
        // Fallback giữ nguyên checkoutUrl / qrCode giả lập
      }
    }

    const order = new PaymentOrder(orderId, {
      userId,
      amountVnd: dto.amountVnd,
      provider: dto.provider,
      orderCode,
      checkoutUrl,
      qrCode,
      status: 'PENDING',
      idempotencyKey,
    });

    await this.paymentRepo.save(order);

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      amountVnd: order.amountVnd,
      provider: order.props.provider,
      status: order.status,
      checkoutUrl: order.props.checkoutUrl,
      qrCode: order.props.qrCode,
    };
  }

  async handleWebhook(provider: string, body: any) {
    const adapter = this.gatewayFactory?.getAdapter(provider);
    if (!adapter) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'Cổng thanh toán không hỗ trợ', 400);
    }

    const verifyResult = await adapter.verifyWebhook(body);
    if (!verifyResult.isValid) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'Chữ ký Webhook không hợp lệ', 400);
    }

    let order: PaymentOrder | null = null;
    if (verifyResult.orderCode) {
      order = await this.paymentRepo.findByOrderCode(verifyResult.orderCode);
    }
    if (!order && verifyResult.orderId) {
      order = await this.paymentRepo.findById(verifyResult.orderId);
    }

    if (!order) {
      throw DomainException.notFound('Đơn nạp tiền');
    }

    // Idempotency: Nếu đơn đã thành công từ trước, trả về 200 OK ngay không cộng lặp
    if (order.status === 'SUCCEEDED') {
      return {
        processed: true,
        alreadyProcessed: true,
        orderId: order.id,
        status: order.status,
      };
    }

    order.markSucceeded();
    await this.paymentRepo.update(order);

    let wallet = await this.walletRepo.findByUserId(order.userId);
    if (!wallet) {
      wallet = new Wallet(crypto.randomUUID(), {
        userId: order.userId,
        balanceVnd: 0,
        heldVnd: 0,
      });
      await this.walletRepo.save(wallet);
    }

    wallet.credit(order.amountVnd);
    await this.walletRepo.update(wallet);

    return {
      processed: true,
      orderId: order.id,
      status: order.status,
      amountVnd: order.amountVnd,
      newBalanceVnd: wallet.balanceVnd,
    };
  }

  async getOrderStatus(orderIdOrCode: string) {
    let order: PaymentOrder | null = null;
    const num = Number(orderIdOrCode);
    if (!isNaN(num) && num > 1000) {
      order = await this.paymentRepo.findByOrderCode(num);
    }
    if (!order) {
      order = await this.paymentRepo.findById(orderIdOrCode);
    }

    if (!order) {
      throw DomainException.notFound('Đơn nạp tiền');
    }

    const wallet = await this.walletRepo.findByUserId(order.userId);

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      amountVnd: order.amountVnd,
      provider: order.props.provider,
      status: order.status,
      checkoutUrl: order.props.checkoutUrl,
      qrCode: order.props.qrCode,
      currentBalanceVnd: wallet?.balanceVnd || 0,
    };
  }

  async completeTopupSandbox(orderId: string) {
    const order = await this.paymentRepo.findById(orderId);
    if (!order) {
      throw DomainException.notFound('Đơn nạp tiền');
    }

    if (order.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đơn hàng không ở trạng thái PENDING', 409);
    }

    order.markSucceeded();
    await this.paymentRepo.update(order);

    let wallet = await this.walletRepo.findByUserId(order.userId);
    if (!wallet) {
      wallet = new Wallet(crypto.randomUUID(), {
        userId: order.userId,
        balanceVnd: 0,
        heldVnd: 0,
      });
      await this.walletRepo.save(wallet);
    }

    wallet.credit(order.amountVnd);
    await this.walletRepo.update(wallet);

    return {
      orderId: order.id,
      status: order.status,
      newBalanceVnd: wallet.balanceVnd,
    };
  }

  async purchaseSku(userId: string, dto: PurchaseSkuDto) {
    const prices: Record<string, number> = {
      PLUS_1_MONTH: 49000,
      PLUS_1_YEAR: 499000,
      OPPORTUNITY_BOOST: 99000,
      VERIFICATION_BADGE: 29000,
      PLUS_30D: 99000,
      PROMOTE_7D: 199000,
    };

    const price = prices[dto.skuCode];
    if (!price) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'Mã SKU không hợp lệ', 400);
    }

    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      throw new DomainException(ErrorCode.INSUFFICIENT_FUNDS, 'Ví chưa có số dư', 422);
    }

    if (wallet.availableVnd < price) {
      throw new DomainException(ErrorCode.INSUFFICIENT_FUNDS, 'Số dư khả dụng không đủ để mua gói này', 422);
    }

    wallet.hold(price);
    await this.walletRepo.update(wallet);

    wallet.capture(price);
    await this.walletRepo.update(wallet);

    return {
      success: true,
      skuCode: dto.skuCode,
      priceVnd: price,
      remainingBalanceVnd: wallet.balanceVnd,
      entitlementStatus: 'ACTIVE',
      activatedAt: new Date().toISOString(),
    };
  }
}
