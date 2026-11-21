import { Injectable } from '@nestjs/common';
import {
  IPaymentGatewayAdapter,
  CreatePaymentParams,
  PaymentLinkResult,
  WebhookResult,
} from '../../domain/ports/payment-gateway.port';

@Injectable()
export class SandboxPaymentAdapter implements IPaymentGatewayAdapter {
  readonly provider = 'SANDBOX';

  async createPayment(params: CreatePaymentParams): Promise<PaymentLinkResult> {
    return {
      checkoutUrl: `https://sandbox.scholink.vn/checkout/${params.orderId}`,
      qrCode: `https://img.vietqr.io/image/970422-SCHOLINK-compact2.png?amount=${params.amountVnd}&addInfo=${encodeURIComponent(params.description)}&accountName=SCHOLINK%20SANDBOX`,
      orderCode: params.orderCode,
    };
  }

  async verifyWebhook(body: any): Promise<WebhookResult> {
    const data = body.data || body;
    return {
      isValid: true,
      orderCode: Number(data.orderCode || 0),
      orderId: data.orderId,
      amountVnd: Number(data.amount || 0),
      status: 'SUCCEEDED',
      transId: data.transId || `SANDBOX_TX_${Date.now()}`,
      raw: data,
    };
  }

  async queryOrder(orderCode: number | string): Promise<WebhookResult> {
    return {
      isValid: true,
      orderCode: Number(orderCode),
      status: 'SUCCEEDED',
    };
  }
}
