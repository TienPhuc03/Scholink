import { z } from 'zod';

export const TopupDtoSchema = z.object({
  amountVnd: z
    .number()
    .int('Số tiền phải là số nguyên')
    .min(10000, 'Số tiền nạp tối thiểu là 10.000 VND')
    .max(5000000, 'Số tiền nạp tối đa là 5.000.000 VND/lần'),
  provider: z.enum(['MOMO', 'VNPAY', 'ZALOPAY', 'SANDBOX']).default('SANDBOX'),
});

export type TopupDto = z.infer<typeof TopupDtoSchema>;

export const PurchaseSkuDtoSchema = z.object({
  skuCode: z.enum(['PLUS_1_MONTH', 'PLUS_1_YEAR', 'OPPORTUNITY_BOOST', 'VERIFICATION_BADGE']),
  priceVersion: z.number().int().default(1),
  refId: z.string().optional(),
});

export type PurchaseSkuDto = z.infer<typeof PurchaseSkuDtoSchema>;
