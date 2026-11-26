import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import { DomainException, ErrorCode } from '@shared';
import {
  IPaymentGatewayAdapter,
  CreatePaymentParams,
  PaymentLinkResult,
  WebhookResult,
} from '../../domain/ports/payment-gateway.port';

const isDevOrTest = (): boolean =>
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

const DEFAULT_PAYOS_RETURN_URL = 'http://localhost:3000/portal#wallet';

@Injectable()
export class PayOsPaymentAdapter implements IPaymentGatewayAdapter {
  private readonly logger = new Logger(PayOsPaymentAdapter.name);
  readonly provider = 'PAYOS';
  private payosClient: any = null;

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() clientOverride?: any,
  ) {
    if (clientOverride) {
      this.payosClient = clientOverride;
      return;
    }

    const clientId = this.getEnv('PAYOS_CLIENT_ID');
    const apiKey = this.getEnv('PAYOS_API_KEY');
    const checksumKey = this.getEnv('PAYOS_CHECKSUM_KEY');

    if (clientId && apiKey && checksumKey) {
      try {
        this.payosClient = new PayOS({ clientId, apiKey, checksumKey });
        this.logger.log('PayOS Client đã được cấu hình và sẵn sàng.');
      } catch (err: any) {
        this.logger.error(`Lỗi khởi tạo PayOS Client: ${err.message}`);
      }
    } else {
      this.logger.warn('Chưa cấu hình biến môi trường PayOS (PAYOS_CLIENT_ID). Sử dụng chế độ VietQR Sandbox tự động.');
    }
  }

  private getEnv(key: string): string | undefined {
    const val = this.configService?.get<string>(key) ?? process.env[key];
    return val?.trim() || undefined;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentLinkResult> {
    if (this.payosClient) {
      try {
        // Mô tả tối đa 25 ký tự không dấu theo quy định PayOS
        const safeDesc = params.description
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9 ]/g, '')
          .slice(0, 25);

        const configuredReturnUrl = this.getEnv('PAYOS_RETURN_URL') || DEFAULT_PAYOS_RETURN_URL;
        const configuredCancelUrl = this.getEnv('PAYOS_CANCEL_URL') || configuredReturnUrl;

        const response = await this.payosClient.paymentRequests.create({
          orderCode: params.orderCode,
          amount: params.amountVnd,
          description: safeDesc || `SCHOLINK ${params.orderCode % 10000}`,
          returnUrl: params.returnUrl || configuredReturnUrl,
          cancelUrl: params.cancelUrl || configuredCancelUrl,
        });

        return {
          checkoutUrl: response.checkoutUrl,
          qrCode: response.qrCode,
          orderCode: params.orderCode,
        };
      } catch (err: any) {
        this.logger.error(`Lỗi gọi PayOS paymentRequests.create: ${err.message}`);
        if (!isDevOrTest()) {
          throw new DomainException(
            ErrorCode.UPSTREAM_UNAVAILABLE,
            'Cổng thanh toán PayOS hiện không khả dụng, vui lòng thử lại sau',
            503,
          );
        }
      }
    } else if (!isDevOrTest()) {
      throw new DomainException(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Cổng thanh toán PayOS chưa được cấu hình trên máy chủ',
        503,
      );
    }

    // Mock VietQR fallback (chỉ dùng cho development/test)
    const simulatedQr = `https://img.vietqr.io/image/970422-SCHOLINK-compact2.png?amount=${params.amountVnd}&addInfo=${encodeURIComponent(params.description)}&accountName=SCHOLINK%20ECOSYSTEM`;
    const simulatedCheckoutUrl = `https://pay.scholink.edu.vn/checkout/${params.orderId}?orderCode=${params.orderCode}&amount=${params.amountVnd}`;

    return {
      checkoutUrl: simulatedCheckoutUrl,
      qrCode: simulatedQr,
      orderCode: params.orderCode,
    };
  }

  async verifyWebhook(body: any): Promise<WebhookResult> {
    if (this.payosClient) {
      try {
        const verified = await this.payosClient.webhooks.verify(body);
        const isPaid = !verified.code || verified.code === '00';
        return {
          isValid: true,
          orderCode: Number(verified.orderCode),
          amountVnd: Number(verified.amount),
          status: isPaid ? 'SUCCEEDED' : 'FAILED',
          transId: verified.reference,
          raw: verified,
        };
      } catch (err: any) {
        this.logger.warn(`Xác thực Webhook PayOS thất bại: ${err.message}`);
        return { isValid: false };
      }
    }

    if (!isDevOrTest()) {
      this.logger.error('Từ chối webhook PayOS: chưa cấu hình PayOS client trên môi trường production.');
      return { isValid: false };
    }

    // Dev/Test verification (chỉ khi NODE_ENV là development hoặc test)
    if (body) {
      const data = body.data || body;
      const orderCode = Number(data.orderCode);
      const amount = Number(data.amount);
      if (orderCode) {
        return {
          isValid: true,
          orderCode,
          amountVnd: amount,
          status: 'SUCCEEDED',
          transId: data.reference || `PAYOS_TRANS_${Date.now()}`,
          raw: data,
        };
      }
    }

    return { isValid: false };
  }

  async queryOrder(orderCode: number | string): Promise<WebhookResult> {
    if (!this.payosClient) {
      return { isValid: false };
    }

    try {
      const res = await this.payosClient.paymentRequests.get(orderCode);
      const rawStatus = String(res?.status || '').toUpperCase();
      const status: WebhookResult['status'] =
        rawStatus === 'PAID'
          ? 'SUCCEEDED'
          : rawStatus === 'CANCELLED'
            ? 'CANCELLED'
            : rawStatus === 'EXPIRED' || rawStatus === 'FAILED'
              ? 'FAILED'
              : 'PENDING';

      const paidAmount =
        status === 'SUCCEEDED'
          ? Number(res.amountPaid ?? res.amount ?? 0)
          : Number(res.amount ?? 0);

      return {
        isValid: true,
        orderCode: Number(res.orderCode ?? orderCode),
        amountVnd: paidAmount,
        status,
        transId: res.id,
        raw: res,
      };
    } catch (err: any) {
      this.logger.error(`Lỗi truy vấn PayOS order ${orderCode}: ${err.message}`);
      return { isValid: false };
    }
  }
}
