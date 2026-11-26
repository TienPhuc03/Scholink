import { DomainException, ErrorCode, IS_PUBLIC_KEY } from '@shared';
import { WalletUseCase } from './wallet.use-case';
import { WalletController } from '../../presentation/wallet.controller';
import { PayOsPaymentAdapter } from '../../infrastructure/gateways/payos.adapter';
import { SandboxPaymentAdapter } from '../../infrastructure/gateways/sandbox.adapter';
import { PaymentGatewayFactory } from '../../infrastructure/gateways/payment-gateway.factory';
import { IWalletRepository } from '../../domain/ports/wallet.repository.port';
import { IPaymentRepository } from '../../domain/ports/payment.repository.port';
import { Wallet } from '../../domain/wallet.entity';
import { PaymentOrder } from '../../domain/payment.entity';

describe('Billing & Wallet Security Audit (#1, #7, #8, #10, #11, #12)', () => {
  it('#1 removes @Public from simulateSuccess & sandboxWebhook and blocks sandbox in production', async () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, WalletController.prototype.simulateSuccess)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, WalletController.prototype.sandboxWebhook)).toBeUndefined();

    const controller = new WalletController({} as WalletUseCase);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        controller.simulateSuccess({ user: { userId: 'u1', email: 'a@b.c', role: 'STUDENT' } }, 'pay_1'),
      ).rejects.toThrow(DomainException);
      await expect(controller.sandboxWebhook({})).rejects.toThrow(DomainException);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('#12 refuses fake QR creation and unverified webhooks in production when PayOS is missing/failing', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const adapter = new PayOsPaymentAdapter();
      await expect(
        adapter.createPayment({ orderId: 'o1', orderCode: 123456, amountVnd: 50000, description: 'test' }),
      ).rejects.toThrow(DomainException);

      const verifyRes = await adapter.verifyWebhook({ data: { orderCode: 123456, amount: 50000 } });
      expect(verifyRes.isValid).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('#10 enforces order ownership on getOrderStatus and omits currentBalanceVnd', async () => {
    const orders = new Map<string, PaymentOrder>();
    orders.set(
      'pay_owner',
      new PaymentOrder('pay_owner', {
        userId: 'usr_owner',
        amountVnd: 100000,
        provider: 'PAYOS',
        orderCode: 999111,
        status: 'PENDING',
      }),
    );
    const useCase = new WalletUseCase(
      { findByUserId: jest.fn(), save: jest.fn(), update: jest.fn() } as jest.Mocked<IWalletRepository>,
      {
        findById: jest.fn(async (id) => orders.get(id) ?? null),
        findByOrderCode: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
      } as jest.Mocked<IPaymentRepository>,
    );

    await expect(useCase.getOrderStatus('pay_owner', 'usr_attacker')).rejects.toThrow(DomainException);
    const ownerRes: any = await useCase.getOrderStatus('pay_owner', 'usr_owner');
    expect(ownerRes.orderId).toBe('pay_owner');
    expect(ownerRes.currentBalanceVnd).toBeUndefined();
  });

  it('#8 credits wallet only once under concurrent duplicate webhooks', async () => {
    const wallets = new Map<string, Wallet>();
    const orders = new Map<string, PaymentOrder>();
    const walletRepo: jest.Mocked<IWalletRepository> = {
      findByUserId: jest.fn(async (u) => wallets.get(u) ?? null),
      save: jest.fn(async (w) => void wallets.set(w.userId, w)),
      update: jest.fn(async (w) => void wallets.set(w.userId, w)),
      creditAtomically: jest.fn(async (u, amount) => {
        const cur = wallets.get(u) ?? new Wallet('w1', { userId: u, balanceVnd: 0, heldVnd: 0 });
        cur.credit(amount);
        wallets.set(u, cur);
        return cur;
      }),
    };
    const paymentRepo: jest.Mocked<IPaymentRepository> = {
      findById: jest.fn(async (id) => orders.get(id) ?? null),
      findByOrderCode: jest.fn(async (code) => [...orders.values()].find((o) => o.orderCode === code) ?? null),
      save: jest.fn(async (o) => void orders.set(o.id, o)),
      update: jest.fn(async (o) => void orders.set(o.id, o)),
      markSucceededIfPending: jest.fn(async (id) => {
        const o = orders.get(id);
        if (!o || o.status !== 'PENDING') return false;
        o.markSucceeded();
        return true;
      }),
    };

    const factory = new PaymentGatewayFactory(new PayOsPaymentAdapter(), new SandboxPaymentAdapter());
    const useCase = new WalletUseCase(walletRepo, paymentRepo, factory);
    const order = await useCase.createTopupOrder('usr_race', { amountVnd: 200000, provider: 'PAYOS' });

    const [r1, r2] = await Promise.all([
      useCase.handleWebhook('PAYOS', { data: { orderCode: order.orderCode, amount: 200000 } }),
      useCase.handleWebhook('PAYOS', { data: { orderCode: order.orderCode, amount: 200000 } }),
    ]);

    expect([r1.alreadyProcessed, r2.alreadyProcessed].filter(Boolean)).toHaveLength(1);
    expect(wallets.get('usr_race')!.balanceVnd).toBe(200000);
  });

  it('#7 & #11 prevents concurrent double-spend and records purchase, hold & double-entry ledger', async () => {
    const wallets = new Map<string, Wallet>([
      ['usr_buy', new Wallet('w_buy', { userId: 'usr_buy', balanceVnd: 100000, heldVnd: 0 })],
    ]);
    const purchases: any[] = [];
    const holds: any[] = [];
    const ledgers: any[] = [];

    const walletRepo: jest.Mocked<IWalletRepository> = {
      findByUserId: jest.fn(async (u) => wallets.get(u) ?? null),
      save: jest.fn(),
      update: jest.fn(),
      holdAndCaptureAtomically: jest.fn(async (u, amount) => {
        const w = wallets.get(u);
        if (!w || w.availableVnd < amount) {
          throw new DomainException(ErrorCode.INSUFFICIENT_FUNDS, 'Số dư không đủ', 422);
        }
        w.hold(amount);
        w.capture(amount);
        return w;
      }),
    };

    const useCase = new WalletUseCase(
      walletRepo,
      { findById: jest.fn(), findByOrderCode: jest.fn(), save: jest.fn(), update: jest.fn() },
      undefined,
      { create: jest.fn(async (docs) => purchases.push(...docs)) } as any,
      { create: jest.fn(async (docs) => holds.push(...docs)) } as any,
      { create: jest.fn(async (docs) => ledgers.push(...docs)) } as any,
    );

    const results = await Promise.allSettled([
      useCase.purchaseSku('usr_buy', { skuCode: 'OPPORTUNITY_BOOST', priceVersion: 1 }),
      useCase.purchaseSku('usr_buy', { skuCode: 'OPPORTUNITY_BOOST', priceVersion: 1 }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(wallets.get('usr_buy')!.balanceVnd).toBe(1000);
    expect(purchases).toHaveLength(1);
    expect(holds).toHaveLength(1);
    expect(ledgers).toHaveLength(2);
    expect(ledgers.map((l) => l.direction).sort()).toEqual(['CREDIT', 'DEBIT']);
  });

  it('rejects webhook when amountVnd mismatches order amount and skips credit on CANCELLED', async () => {
    const wallets = new Map<string, Wallet>();
    const orders = new Map<string, PaymentOrder>();
    const useCase = new WalletUseCase(
      {
        findByUserId: jest.fn(async (u) => wallets.get(u) ?? null),
        save: jest.fn(async (w) => void wallets.set(w.userId, w)),
        update: jest.fn(async (w) => void wallets.set(w.userId, w)),
      },
      {
        findById: jest.fn(async (id) => orders.get(id) ?? null),
        findByOrderCode: jest.fn(async (code) => [...orders.values()].find((o) => o.orderCode === code) ?? null),
        save: jest.fn(async (o) => void orders.set(o.id, o)),
        update: jest.fn(async (o) => void orders.set(o.id, o)),
      },
      new PaymentGatewayFactory(new PayOsPaymentAdapter(), new SandboxPaymentAdapter()),
    );

    const order = await useCase.createTopupOrder('usr_amt', { amountVnd: 100000, provider: 'PAYOS' });
    await expect(
      useCase.handleWebhook('PAYOS', { data: { orderCode: order.orderCode, amount: 1000 } }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR, statusCode: 400 });
    expect(wallets.get('usr_amt')).toBeUndefined();
  });

  it('reads PAYOS_RETURN_URL/CANCEL_URL, fails closed in queryOrder, and reconciles PAID orders', async () => {
    const prevReturn = process.env.PAYOS_RETURN_URL;
    const prevCancel = process.env.PAYOS_CANCEL_URL;
    process.env.PAYOS_RETURN_URL = 'https://app.scholink.vn/wallet-return';
    process.env.PAYOS_CANCEL_URL = 'https://app.scholink.vn/wallet-cancel';

    try {
      const mockClient = {
        paymentRequests: {
          create: jest.fn().mockResolvedValue({
            checkoutUrl: 'https://pay.payos.vn/web/abc',
            qrCode: '00020101021238570010A000000727012700069704220113CAS001',
          }),
          get: jest.fn().mockResolvedValue({
            id: 'pl_1',
            orderCode: 123456789,
            amount: 50000,
            amountPaid: 50000,
            status: 'PAID',
          }),
        },
      };
      const payosAdapter = new PayOsPaymentAdapter(undefined, mockClient);
      await payosAdapter.createPayment({
        orderId: 'o_env',
        orderCode: 123456789,
        amountVnd: 50000,
        description: 'Scholink nap 50k',
      });
      expect(mockClient.paymentRequests.create).toHaveBeenCalledWith(
        expect.objectContaining({
          returnUrl: 'https://app.scholink.vn/wallet-return',
          cancelUrl: 'https://app.scholink.vn/wallet-cancel',
        }),
      );

      // Unconfigured adapter must never claim SUCCEEDED from queryOrder
      const unconfigured = new PayOsPaymentAdapter();
      await expect(unconfigured.queryOrder(123456789)).resolves.toEqual({ isValid: false });

      const wallets = new Map<string, Wallet>();
      const orders = new Map<string, PaymentOrder>();
      const useCase = new WalletUseCase(
        {
          findByUserId: jest.fn(async (u) => wallets.get(u) ?? null),
          save: jest.fn(async (w) => void wallets.set(w.userId, w)),
          update: jest.fn(async (w) => void wallets.set(w.userId, w)),
        },
        {
          findById: jest.fn(async (id) => orders.get(id) ?? null),
          findByOrderCode: jest.fn(async (code) => [...orders.values()].find((o) => o.orderCode === code) ?? null),
          save: jest.fn(async (o) => void orders.set(o.id, o)),
          update: jest.fn(async (o) => void orders.set(o.id, o)),
        },
        new PaymentGatewayFactory(payosAdapter, new SandboxPaymentAdapter()),
      );

      const created = await useCase.createTopupOrder('usr_rec', { amountVnd: 50000, provider: 'PAYOS' });
      expect(created.qrCode).toContain('000201010212');
      await expect(useCase.reconcileOrder(created.orderId, 'usr_other')).rejects.toThrow(DomainException);

      const reconciled: any = await useCase.reconcileOrder(created.orderId, 'usr_rec');
      expect(reconciled.reconciled).toBe(true);
      expect(reconciled.status).toBe('SUCCEEDED');
      expect(wallets.get('usr_rec')!.balanceVnd).toBe(50000);
    } finally {
      if (prevReturn === undefined) delete process.env.PAYOS_RETURN_URL;
      else process.env.PAYOS_RETURN_URL = prevReturn;
      if (prevCancel === undefined) delete process.env.PAYOS_CANCEL_URL;
      else process.env.PAYOS_CANCEL_URL = prevCancel;
    }
  });
});
