import { Wallet } from './wallet.entity';
import { DomainException, ErrorCode } from '@shared';

describe('Wallet Entity & Financial Invariant Rules (SRS FR-BILL)', () => {
  it('should initialize wallet with correct balance and zero held amount', () => {
    const wallet = new Wallet('wallet_001', {
      userId: 'user_001',
      balanceVnd: 500000,
      heldVnd: 0,
      version: 1,
    });

    expect(wallet.balanceVnd).toBe(500000);
    expect(wallet.heldVnd).toBe(0);
    expect(wallet.availableVnd).toBe(500000);
    expect(wallet.version).toBe(1);
  });

  it('should credit wallet balance and increment version', () => {
    const wallet = new Wallet('wallet_002', {
      userId: 'user_002',
      balanceVnd: 100000,
      heldVnd: 0,
      version: 1,
    });

    wallet.credit(200000);
    expect(wallet.balanceVnd).toBe(300000);
    expect(wallet.availableVnd).toBe(300000);
    expect(wallet.version).toBe(2);
  });

  it('should throw validation error when crediting zero or negative amounts', () => {
    const wallet = new Wallet('wallet_003', {
      userId: 'user_003',
      balanceVnd: 50000,
      heldVnd: 0,
    });

    expect(() => wallet.credit(0)).toThrow(DomainException);
    expect(() => wallet.credit(-50000)).toThrow(DomainException);
  });

  it('should hold amount when available balance is sufficient', () => {
    const wallet = new Wallet('wallet_004', {
      userId: 'user_004',
      balanceVnd: 300000,
      heldVnd: 50000,
      version: 1,
    });

    // Available is 250,000. Hold 150,000.
    wallet.hold(150000);
    expect(wallet.heldVnd).toBe(200000);
    expect(wallet.availableVnd).toBe(100000);
    expect(wallet.balanceVnd).toBe(300000);
    expect(wallet.version).toBe(2);
  });

  it('should reject hold when amount exceeds available balance (INSUFFICIENT_FUNDS 422)', () => {
    const wallet = new Wallet('wallet_005', {
      userId: 'user_005',
      balanceVnd: 100000,
      heldVnd: 80000,
    });

    // Available is only 20,000. Hold 50,000 should fail.
    try {
      wallet.hold(50000);
      fail('Expected INSUFFICIENT_FUNDS exception');
    } catch (err: any) {
      expect(err).toBeInstanceOf(DomainException);
      expect(err.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
      expect(err.statusCode).toBe(422);
    }
  });

  it('should capture held amount reducing both balance and held funds', () => {
    const wallet = new Wallet('wallet_006', {
      userId: 'user_006',
      balanceVnd: 500000,
      heldVnd: 200000,
      version: 1,
    });

    wallet.capture(200000);
    expect(wallet.heldVnd).toBe(0);
    expect(wallet.balanceVnd).toBe(300000);
    expect(wallet.availableVnd).toBe(300000);
    expect(wallet.version).toBe(2);
  });

  it('should release held amount restoring available balance', () => {
    const wallet = new Wallet('wallet_007', {
      userId: 'user_007',
      balanceVnd: 500000,
      heldVnd: 150000,
      version: 1,
    });

    wallet.release(150000);
    expect(wallet.heldVnd).toBe(0);
    expect(wallet.balanceVnd).toBe(500000);
    expect(wallet.availableVnd).toBe(500000);
    expect(wallet.version).toBe(2);
  });
});
