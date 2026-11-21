import { Injectable } from '@nestjs/common';
import { IPaymentGatewayAdapter } from '../../domain/ports/payment-gateway.port';
import { PayOsPaymentAdapter } from './payos.adapter';
import { SandboxPaymentAdapter } from './sandbox.adapter';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly payosAdapter: PayOsPaymentAdapter,
    private readonly sandboxAdapter: SandboxPaymentAdapter,
  ) {}

  getAdapter(provider?: string): IPaymentGatewayAdapter {
    const norm = (provider || 'PAYOS').toUpperCase();
    if (norm === 'PAYOS' || norm === 'VNPAY' || norm === 'MOMO' || norm === 'ZALOPAY') {
      // PayOS phục vụ thanh toán VietQR đa ngân hàng và ví
      return this.payosAdapter;
    }
    return this.sandboxAdapter;
  }
}
