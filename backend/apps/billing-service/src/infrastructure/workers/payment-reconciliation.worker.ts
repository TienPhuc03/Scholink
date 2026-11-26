import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WalletUseCase } from '../../application/use-cases/wallet.use-case';

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class PaymentReconciliationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReconciliationWorker.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly walletUseCase: WalletUseCase) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, RECONCILE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<void> {
    try {
      const result = await this.walletUseCase.reconcilePendingOrders();
      if (result.updated > 0) {
        this.logger.log(
          `[PaymentReconciliation] Đã đối soát ${result.checked} đơn chờ, cập nhật ${result.updated} đơn.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[PaymentReconciliation] Lỗi chu kỳ đối soát: ${msg}`);
    }
  }
}
