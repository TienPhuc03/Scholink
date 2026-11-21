import { WalletUseCase } from './wallet.use-case';
import { IWalletRepository } from '../../domain/ports/wallet.repository.port';
import { IPaymentRepository } from '../../domain/ports/payment.repository.port';
import { Wallet } from '../../domain/wallet.entity';
import { PaymentOrder } from '../../domain/payment.entity';
import { PayOsPaymentAdapter } from '../../infrastructure/gateways/payos.adapter';
import { SandboxPaymentAdapter } from '../../infrastructure/gateways/sandbox.adapter';
import { PaymentGatewayFactory } from '../../infrastructure/gateways/payment-gateway.factory';

describe('WalletUseCase & PayOS Payment Gateway Integration', () => {
  let useCase: WalletUseCase;
  let mockWalletRepo: jest.Mocked<IWalletRepository>;
  let mockPaymentRepo: jest.Mocked<IPaymentRepository>;
  let gatewayFactory: PaymentGatewayFactory;
  const wallets = new Map<string, Wallet>();
  const payments = new Map<string, PaymentOrder>();

  beforeEach(() => {
    wallets.clear();
    payments.clear();

    mockWalletRepo = {
      findByUserId: jest.fn(async (userId: string) => wallets.get(userId) || null),
      save: jest.fn(async (w: Wallet) => {
        wallets.set(w.userId, w);
      }),
      update: jest.fn(async (w: Wallet) => {
        wallets.set(w.userId, w);
      }),
    };

    mockPaymentRepo = {
      findById: jest.fn(async (id: string) => payments.get(id) || null),
      findByOrderCode: jest.fn(async (code: number) => {
        for (const p of payments.values()) {
          if (p.orderCode === code) return p;
        }
        return null;
      }),
      save: jest.fn(async (p: PaymentOrder) => {
        payments.set(p.id, p);
      }),
      update: jest.fn(async (p: PaymentOrder) => {
        payments.set(p.id, p);
      }),
    };

    const payosAdapter = new PayOsPaymentAdapter();
    const sandboxAdapter = new SandboxPaymentAdapter();
    gatewayFactory = new PaymentGatewayFactory(payosAdapter, sandboxAdapter);

    useCase = new WalletUseCase(mockWalletRepo, mockPaymentRepo, gatewayFactory);
  });

  it('1. should create a PayOS topup order with integer orderCode and VietQR', async () => {
    const res = await useCase.createTopupOrder('usr_001', {
      amountVnd: 100000,
      provider: 'PAYOS',
    });

    expect(res.orderId).toBeDefined();
    expect(res.orderCode).toBeGreaterThan(1000);
    expect(res.amountVnd).toBe(100000);
    expect(res.status).toBe('PENDING');
    expect(res.checkoutUrl).toBeDefined();
    expect(res.qrCode).toContain('vietqr.io');

    const saved = payments.get(res.orderId);
    expect(saved).toBeDefined();
    expect(saved!.orderCode).toBe(res.orderCode);
  });

  it('2. should process PayOS webhook and credit wallet atomically', async () => {
    const topup = await useCase.createTopupOrder('usr_002', {
      amountVnd: 200000,
      provider: 'PAYOS',
    });

    const webhookBody = {
      code: '00',
      desc: 'success',
      data: {
        orderCode: topup.orderCode,
        amount: 200000,
        description: 'Scholink topup',
        accountNumber: '123456789',
        reference: 'REF_PAYOS_999',
        transactionDateTime: '2026-11-21 20:30:00',
      },
    };

    const webhookRes = await useCase.handleWebhook('PAYOS', webhookBody);

    expect(webhookRes.processed).toBe(true);
    expect(webhookRes.status).toBe('SUCCEEDED');
    expect(webhookRes.newBalanceVnd).toBe(200000);

    const wallet = await mockWalletRepo.findByUserId('usr_002');
    expect(wallet!.balanceVnd).toBe(200000);
    expect(wallet!.availableVnd).toBe(200000);
  });

  it('3. should be idempotent and not credit twice on duplicate webhook calls', async () => {
    const topup = await useCase.createTopupOrder('usr_003', {
      amountVnd: 50000,
      provider: 'PAYOS',
    });

    const webhookBody = {
      data: {
        orderCode: topup.orderCode,
        amount: 50000,
        reference: 'REF_003',
      },
    };

    // First call: Succeeded
    const res1 = await useCase.handleWebhook('PAYOS', webhookBody);
    expect(res1.newBalanceVnd).toBe(50000);

    // Second call: Duplicate webhook ignored
    const res2 = await useCase.handleWebhook('PAYOS', webhookBody);
    expect(res2.alreadyProcessed).toBe(true);

    const wallet = await mockWalletRepo.findByUserId('usr_003');
    expect(wallet!.balanceVnd).toBe(50000); // Vẫn chỉ là 50.000đ, không bị cộng x2
  });

  it('4. should purchase SKU PLUS_1_MONTH deducting wallet balance', async () => {
    // Seed wallet with 100.000đ
    const wallet = new Wallet('w_004', {
      userId: 'usr_004',
      balanceVnd: 100000,
      heldVnd: 0,
    });
    wallets.set('usr_004', wallet);

    const purchaseRes = await useCase.purchaseSku('usr_004', {
      skuCode: 'PLUS_1_MONTH',
      priceVersion: 1,
    });

    expect(purchaseRes.success).toBe(true);
    expect(purchaseRes.priceVnd).toBe(49000);
    expect(purchaseRes.remainingBalanceVnd).toBe(51000);
    expect(wallet.balanceVnd).toBe(51000);
    expect(wallet.heldVnd).toBe(0);
  });
});
