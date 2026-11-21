export interface CreatePaymentParams {
  orderId: string;
  orderCode: number;
  amountVnd: number;
  description: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymentLinkResult {
  checkoutUrl: string;
  qrCode?: string;
  orderCode: number;
}

export interface WebhookResult {
  isValid: boolean;
  orderCode?: number;
  orderId?: string;
  amountVnd?: number;
  status?: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  transId?: string;
  raw?: any;
}

export interface IPaymentGatewayAdapter {
  readonly provider: string;
  createPayment(params: CreatePaymentParams): Promise<PaymentLinkResult>;
  verifyWebhook(body: any, headers?: Record<string, any>): Promise<WebhookResult>;
  queryOrder(orderCode: number | string): Promise<WebhookResult>;
}

export const PAYMENT_GATEWAY_ADAPTER = 'PAYMENT_GATEWAY_ADAPTER';
