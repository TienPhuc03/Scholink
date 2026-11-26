import { Injectable, Inject, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import * as crypto from 'crypto';
import { IWalletRepository, WALLET_REPOSITORY } from '../../domain/ports/wallet.repository.port';
import { IPaymentRepository, PAYMENT_REPOSITORY } from '../../domain/ports/payment.repository.port';
import { Wallet } from '../../domain/wallet.entity';
import { PaymentOrder } from '../../domain/payment.entity';
import { TopupDto, PurchaseSkuDto } from '../dtos/billing.dto';
import { DomainException, ErrorCode } from '@shared';
import { PaymentGatewayFactory } from '../../infrastructure/gateways/payment-gateway.factory';
import {
  HoldDocument,
  HoldModel,
  LedgerEntryDocument,
  LedgerEntryModel,
  PurchaseDocument,
  PurchaseModel,
} from '../../infrastructure/persistence/payment.schema';

const isTransactionUnsupportedError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as { message?: string }).message ?? '');
  return (
    msg.includes('Transaction numbers are only allowed on a replica set') ||
    msg.includes('transactions are not supported')
  );
};

@Injectable()
export class WalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: IWalletRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepo: IPaymentRepository,
    @Optional() private readonly gatewayFactory?: PaymentGatewayFactory,
    @Optional()
    @InjectModel(PurchaseModel.name)
    private readonly purchaseModel?: Model<PurchaseDocument>,
    @Optional()
    @InjectModel(HoldModel.name)
    private readonly holdModel?: Model<HoldDocument>,
    @Optional()
    @InjectModel(LedgerEntryModel.name)
    private readonly ledgerModel?: Model<LedgerEntryDocument>,
    @Optional()
    @InjectConnection()
    private readonly connection?: Connection,
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

    let checkoutUrl = '';
    let qrCode = '';

    if (adapter) {
      const paymentRes = await adapter.createPayment({
        orderId,
        orderCode,
        amountVnd: dto.amountVnd,
        description,
      });
      checkoutUrl = paymentRes.checkoutUrl;
      qrCode = paymentRes.qrCode || '';
    } else if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      checkoutUrl = `https://sandbox.scholink.vn/checkout/${orderId}`;
      qrCode = `https://img.vietqr.io/image/970422-SCHOLINK-compact2.png?amount=${dto.amountVnd}&addInfo=${encodeURIComponent(description)}&accountName=SCHOLINK%20ECOSYSTEM`;
    } else {
      throw new DomainException(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Cổng thanh toán chưa sẵn sàng',
        503,
      );
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

    if (verifyResult.status === 'FAILED' || verifyResult.status === 'CANCELLED') {
      await this.markNonCreditStatus(order, verifyResult.status);
      return {
        processed: true,
        orderId: order.id,
        status: verifyResult.status,
      };
    }

    if (verifyResult.status && verifyResult.status !== 'SUCCEEDED') {
      return {
        processed: false,
        orderId: order.id,
        status: order.status,
      };
    }

    if (
      verifyResult.amountVnd === undefined ||
      !Number.isFinite(verifyResult.amountVnd) ||
      verifyResult.amountVnd !== order.amountVnd
    ) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Số tiền Webhook không khớp với đơn hàng',
        400,
      );
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

    const creditRes = await this.claimOrderAndCreditWallet(order, `TOPUP:${order.id}`);
    if (creditRes.alreadyProcessed) {
      return {
        processed: true,
        alreadyProcessed: true,
        orderId: order.id,
        status: 'SUCCEEDED',
      };
    }

    return {
      processed: true,
      orderId: order.id,
      status: 'SUCCEEDED',
      amountVnd: order.amountVnd,
      newBalanceVnd: creditRes.newBalanceVnd,
    };
  }

  async getOrderStatus(orderIdOrCode: string, userId?: string) {
    const order = await this.findOrderByIdOrCode(orderIdOrCode, userId);

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

  /**
   * Chủ động đối soát đơn PENDING với cổng thanh toán (PayOS queryOrder)
   * trong trường hợp webhook rớt mạng hoặc chưa tới.
   */
  async reconcileOrder(orderIdOrCode: string, userId?: string) {
    const order = await this.findOrderByIdOrCode(orderIdOrCode, userId);

    if (order.status === 'SUCCEEDED') {
      return {
        reconciled: true,
        alreadyProcessed: true,
        orderId: order.id,
        orderCode: order.orderCode,
        amountVnd: order.amountVnd,
        provider: order.props.provider,
        status: 'SUCCEEDED',
      };
    }

    if (order.status !== 'PENDING') {
      return {
        reconciled: false,
        orderId: order.id,
        orderCode: order.orderCode,
        amountVnd: order.amountVnd,
        provider: order.props.provider,
        status: order.status,
      };
    }

    const adapter = this.gatewayFactory?.getAdapter(order.props.provider);
    if (!adapter || !order.orderCode) {
      return {
        reconciled: false,
        orderId: order.id,
        orderCode: order.orderCode,
        amountVnd: order.amountVnd,
        provider: order.props.provider,
        status: order.status,
      };
    }

    const queryResult = await adapter.queryOrder(order.orderCode);
    if (!queryResult.isValid) {
      return {
        reconciled: false,
        orderId: order.id,
        orderCode: order.orderCode,
        amountVnd: order.amountVnd,
        provider: order.props.provider,
        status: order.status,
      };
    }

    if (queryResult.status === 'SUCCEEDED') {
      if (
        queryResult.amountVnd !== undefined &&
        Number.isFinite(queryResult.amountVnd) &&
        queryResult.amountVnd !== order.amountVnd
      ) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          'Số tiền đối soát từ cổng thanh toán không khớp với đơn hàng',
          400,
        );
      }

      const creditRes = await this.claimOrderAndCreditWallet(
        order,
        `TOPUP_RECONCILE:${order.id}`,
      );
      return {
        reconciled: true,
        alreadyProcessed: creditRes.alreadyProcessed,
        orderId: order.id,
        orderCode: order.orderCode,
        amountVnd: order.amountVnd,
        provider: order.props.provider,
        status: 'SUCCEEDED',
        ...(creditRes.alreadyProcessed ? {} : { newBalanceVnd: creditRes.newBalanceVnd }),
      };
    }

    if (queryResult.status === 'CANCELLED' || queryResult.status === 'FAILED') {
      await this.markNonCreditStatus(order, queryResult.status);
      return {
        reconciled: true,
        orderId: order.id,
        orderCode: order.orderCode,
        amountVnd: order.amountVnd,
        provider: order.props.provider,
        status: queryResult.status,
      };
    }

    return {
      reconciled: false,
      orderId: order.id,
      orderCode: order.orderCode,
      amountVnd: order.amountVnd,
      provider: order.props.provider,
      status: order.status,
    };
  }

  /**
   * Đối soát định kỳ các đơn PAYOS đang PENDING quá 2 phút; quá 30 phút chưa thanh toán sẽ đánh dấu EXPIRED.
   */
  async reconcilePendingOrders(now: Date = new Date()): Promise<{ checked: number; updated: number }> {
    if (!this.paymentRepo.findPendingOrders) {
      return { checked: 0, updated: 0 };
    }

    const staleBefore = new Date(now.getTime() - 2 * 60 * 1000);
    const expireBefore = new Date(now.getTime() - 30 * 60 * 1000);
    const pendingOrders = await this.paymentRepo.findPendingOrders(staleBefore, 50);

    let updated = 0;
    for (const order of pendingOrders) {
      if (order.props.provider !== 'PAYOS') continue;
      try {
        const res = await this.reconcileOrder(order.id);
        if (res.reconciled) {
          updated++;
          continue;
        }
        const createdAt = order.props.createdAt;
        if (createdAt && createdAt < expireBefore) {
          await this.markNonCreditStatus(order, 'EXPIRED');
          updated++;
        }
      } catch {
        // Bỏ qua đơn lỗi tạm thời để thử lại ở chu kỳ sau
      }
    }

    return { checked: pendingOrders.length, updated };
  }

  private async findOrderByIdOrCode(orderIdOrCode: string, userId?: string): Promise<PaymentOrder> {
    let order: PaymentOrder | null = null;
    const num = Number(orderIdOrCode);
    if (!isNaN(num) && num > 1000) {
      order = await this.paymentRepo.findByOrderCode(num);
    }
    if (!order) {
      order = await this.paymentRepo.findById(orderIdOrCode);
    }

    if (!order || (userId !== undefined && order.userId !== userId)) {
      throw DomainException.notFound('Đơn nạp tiền');
    }

    return order;
  }

  private async claimOrderAndCreditWallet(
    order: PaymentOrder,
    businessRef: string,
  ): Promise<{ alreadyProcessed: boolean; newBalanceVnd: number }> {
    let alreadyProcessed = false;
    let newBalanceVnd = 0;

    await this.runInTransactionWithFallback(async (session) => {
      if (this.paymentRepo.markSucceededIfPending) {
        const claimed = await this.paymentRepo.markSucceededIfPending(order.id, session);
        if (!claimed) {
          alreadyProcessed = true;
          return;
        }
      } else {
        order.markSucceeded();
        await this.paymentRepo.update(order);
      }

      const wallet = await this.creditWalletAndRecordLedger(
        order.userId,
        order.amountVnd,
        businessRef,
        session,
      );
      newBalanceVnd = wallet.balanceVnd;
    });

    return { alreadyProcessed, newBalanceVnd };
  }

  private async markNonCreditStatus(
    order: PaymentOrder,
    nextStatus: 'FAILED' | 'CANCELLED' | 'EXPIRED',
  ): Promise<void> {
    if (order.status !== 'PENDING') return;
    if (this.paymentRepo.markStatusIfPending) {
      await this.paymentRepo.markStatusIfPending(order.id, nextStatus);
      return;
    }
    if (nextStatus === 'CANCELLED') {
      order.markCancelled();
    } else if (nextStatus === 'EXPIRED') {
      order.markExpired();
    } else {
      order.markFailed();
    }
    await this.paymentRepo.update(order);
  }

  async completeTopupSandbox(orderId: string, userId?: string) {
    const order = await this.paymentRepo.findById(orderId);
    if (!order || (userId !== undefined && order.userId !== userId)) {
      throw DomainException.notFound('Đơn nạp tiền');
    }

    if (order.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đơn hàng không ở trạng thái PENDING', 409);
    }

    let newBalanceVnd = 0;
    await this.runInTransactionWithFallback(async (session) => {
      if (this.paymentRepo.markSucceededIfPending) {
        const claimed = await this.paymentRepo.markSucceededIfPending(order.id, session);
        if (!claimed) {
          throw new DomainException(
            ErrorCode.STATE_CONFLICT,
            'Đơn hàng không ở trạng thái PENDING',
            409,
          );
        }
      } else {
        order.markSucceeded();
        await this.paymentRepo.update(order);
      }

      const wallet = await this.creditWalletAndRecordLedger(
        order.userId,
        order.amountVnd,
        `SANDBOX_TOPUP:${order.id}`,
        session,
      );
      newBalanceVnd = wallet.balanceVnd;
    });

    return {
      orderId: order.id,
      status: 'SUCCEEDED',
      newBalanceVnd,
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

    const purchaseId = `pur_${crypto.randomUUID()}`;
    const refId = dto.refId?.trim() || purchaseId;
    let remainingBalanceVnd = 0;

    let expiresAt: Date | null = null;
    if (dto.skuCode === 'PLUS_1_MONTH') {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (dto.skuCode === 'PLUS_1_YEAR') {
      expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else if (dto.skuCode === 'OPPORTUNITY_BOOST') {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    await this.runInTransactionWithFallback(async (session) => {
      let updatedWallet: Wallet;
      if (this.walletRepo.holdAndCaptureAtomically) {
        updatedWallet = await this.walletRepo.holdAndCaptureAtomically(userId, price, session);
      } else {
        const wallet = await this.walletRepo.findByUserId(userId);
        if (!wallet) {
          throw new DomainException(ErrorCode.INSUFFICIENT_FUNDS, 'Ví chưa có số dư', 422);
        }
        if (wallet.availableVnd < price) {
          throw new DomainException(
            ErrorCode.INSUFFICIENT_FUNDS,
            'Số dư khả dụng không đủ để mua gói này',
            422,
          );
        }
        wallet.hold(price);
        await this.walletRepo.update(wallet);
        wallet.capture(price);
        await this.walletRepo.update(wallet);
        updatedWallet = wallet;
      }

      remainingBalanceVnd = updatedWallet.balanceVnd;
      const sessionOpt = session ? { session } : {};

      if (this.purchaseModel) {
        try {
          await this.purchaseModel.create(
            [
              {
                id: purchaseId,
                actorId: userId,
                refId,
                skuCode: dto.skuCode,
                amountVnd: price,
                status: 'FULFILLED',
                expiresAt,
              },
            ],
            sessionOpt,
          );
        } catch (err: any) {
          if (err?.code === 11000) {
            throw DomainException.conflict(
              ErrorCode.STATE_CONFLICT,
              'Giao dịch mua gói với refId này đã tồn tại',
            );
          }
          throw err;
        }
      }

      if (this.holdModel) {
        await this.holdModel.create(
          [
            {
              id: `hold_${crypto.randomUUID()}`,
              purchaseId,
              userId,
              amountVnd: price,
              status: 'CAPTURED',
              expiresAt: new Date(),
            },
          ],
          sessionOpt,
        );
      }

      if (this.ledgerModel) {
        const txId = `tx_${crypto.randomUUID()}`;
        await this.ledgerModel.create(
          [
            {
              id: `led_${crypto.randomUUID()}`,
              txId,
              accountId: `wallet:${userId}`,
              direction: 'DEBIT',
              amountVnd: price,
              businessRef: `PURCHASE:${purchaseId}:${dto.skuCode}`,
            },
            {
              id: `led_${crypto.randomUUID()}`,
              txId,
              accountId: 'platform:revenue',
              direction: 'CREDIT',
              amountVnd: price,
              businessRef: `PURCHASE:${purchaseId}:${dto.skuCode}`,
            },
          ],
          session ? { session, ordered: true } : { ordered: true },
        );
      }
    });

    return {
      success: true,
      purchaseId,
      skuCode: dto.skuCode,
      priceVnd: price,
      remainingBalanceVnd,
      entitlementStatus: 'ACTIVE',
      activatedAt: new Date().toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  async getMyEntitlements(userId: string) {
    const now = new Date();
    const purchases = this.purchaseModel
      ? await this.purchaseModel
          .find({
            actorId: userId,
            status: 'FULFILLED',
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
          })
          .sort({ createdAt: -1 })
          .lean()
          .exec()
      : [];

    const activeSkus = Array.from(new Set(purchases.map((p) => p.skuCode)));
    const hasPlus1Month = activeSkus.includes('PLUS_1_MONTH');
    const hasPlus1Year = activeSkus.includes('PLUS_1_YEAR');
    const hasPlus = hasPlus1Month || hasPlus1Year;
    const hasVerificationBadge = activeSkus.includes('VERIFICATION_BADGE');
    const hasOpportunityBoost = activeSkus.includes('OPPORTUNITY_BOOST');

    const plusPurchases = purchases.filter(
      (p) => p.skuCode === 'PLUS_1_MONTH' || p.skuCode === 'PLUS_1_YEAR',
    );
    const plusExpiresAt =
      plusPurchases.length > 0 && plusPurchases[0].expiresAt
        ? new Date(plusPurchases[0].expiresAt).toISOString()
        : null;

    const boostPurchases = purchases.filter((p) => p.skuCode === 'OPPORTUNITY_BOOST');
    const boostExpiresAt =
      boostPurchases.length > 0 && boostPurchases[0].expiresAt
        ? new Date(boostPurchases[0].expiresAt).toISOString()
        : null;

    return {
      activeSkus,
      entitlements: {
        hasPlus,
        hasVerificationBadge,
        hasOpportunityBoost,
        plusExpiresAt,
        boostExpiresAt,
        badgeExpiresAt: null,
      },
      purchases: purchases.map((p) => ({
        id: p.id,
        skuCode: p.skuCode,
        refId: p.refId,
        amountVnd: p.amountVnd,
        status: p.status,
        createdAt: (p as any).createdAt ? new Date((p as any).createdAt).toISOString() : new Date().toISOString(),
        expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString() : null,
      })),
    };
  }

  private async creditWalletAndRecordLedger(
    userId: string,
    amountVnd: number,
    businessRef: string,
    session?: ClientSession,
  ): Promise<Wallet> {
    let wallet: Wallet;
    if (this.walletRepo.creditAtomically) {
      wallet = await this.walletRepo.creditAtomically(userId, amountVnd, session);
    } else {
      let existing = await this.walletRepo.findByUserId(userId);
      if (!existing) {
        existing = new Wallet(crypto.randomUUID(), {
          userId,
          balanceVnd: 0,
          heldVnd: 0,
        });
        await this.walletRepo.save(existing);
      }
      existing.credit(amountVnd);
      await this.walletRepo.update(existing);
      wallet = existing;
    }

    if (this.ledgerModel) {
      const txId = `tx_${crypto.randomUUID()}`;
      await this.ledgerModel.create(
        [
          {
            id: `led_${crypto.randomUUID()}`,
            txId,
            accountId: 'gateway:payos',
            direction: 'DEBIT',
            amountVnd,
            businessRef,
          },
          {
            id: `led_${crypto.randomUUID()}`,
            txId,
            accountId: `wallet:${userId}`,
            direction: 'CREDIT',
            amountVnd,
            businessRef,
          },
        ],
        session ? { session, ordered: true } : { ordered: true },
      );
    }

    return wallet;
  }

  private async runInTransactionWithFallback(
    work: (session?: ClientSession) => Promise<void>,
  ): Promise<void> {
    if (!this.connection) {
      await work(undefined);
      return;
    }
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await work(session);
      });
    } catch (err: unknown) {
      if (err instanceof DomainException) {
        throw err;
      }
      if (isTransactionUnsupportedError(err)) {
        await work(undefined);
        return;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
}
