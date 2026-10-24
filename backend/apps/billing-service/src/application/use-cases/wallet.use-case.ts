import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { IWalletRepository, WALLET_REPOSITORY } from '../../domain/ports/wallet.repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository.port';
import { Wallet } from '../../domain/wallet.entity';
import { PaymentOrder } from '../../domain/payment.entity';
import { TopupDto, PurchaseSkuDto } from '../dtos/billing.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class WalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: IWalletRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
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
    const orderId = crypto.randomUUID();
    const order = new PaymentOrder(orderId, {
      userId,
      amountVnd: dto.amountVnd,
      provider: dto.provider,
      checkoutUrl: `https://sandbox.scholink.vn/checkout/${orderId}`,
      status: 'PENDING',
      idempotencyKey,
    });

    await this.paymentRepo.save(order);

    return {
      orderId: order.id,
      amountVnd: order.amountVnd,
      status: order.status,
      checkoutUrl: order.props.checkoutUrl,
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
    };

    const price = prices[dto.skuCode];
    if (!price) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'Mã SKU không hợp lệ', 400);
    }

    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet || wallet.availableVnd < price) {
      throw new DomainException(ErrorCode.INSUFFICIENT_FUNDS, 'Số dư ví không đủ để thanh toán', 422);
    }

    wallet.hold(price);
    wallet.capture(price);
    await this.walletRepo.update(wallet);

    return {
      skuCode: dto.skuCode,
      paidVnd: price,
      status: 'FULFILLED',
      remainingBalanceVnd: wallet.balanceVnd,
    };
  }
}
