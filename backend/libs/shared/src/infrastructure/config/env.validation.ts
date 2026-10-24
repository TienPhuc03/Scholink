import { z } from 'zod';

const secretStringSchema = (name: string) =>
  z
    .string({ required_error: `Biến môi trường ${name} là bắt buộc (không được để trống)` })
    .min(32, `Biến môi trường ${name} phải có độ dài tối thiểu 32 ký tự`)
    .refine(
      (val) => !val.startsWith('<REPLACE_') && !val.toLowerCase().startsWith('replace_with_'),
      `Biến môi trường ${name} đang chứa giá trị mẫu (placeholder) chưa được cấu hình thực tế`,
    );

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  IDENTITY_GRPC_URL: z.string().min(3).default('localhost:50051'),
  OPPORTUNITY_GRPC_URL: z.string().min(3).default('localhost:50052'),
  COLLABORATION_GRPC_URL: z.string().min(3).default('localhost:50053'),
  BILLING_GRPC_URL: z.string().min(3).default('localhost:50054'),
  NOTIFICATION_GRPC_URL: z.string().min(3).default('localhost:50055'),
  MONGODB_URI: z.string().min(10, 'MONGODB_URI không hợp lệ').default('mongodb://localhost:27017'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  JWT_SECRET: secretStringSchema('JWT_SECRET'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: secretStringSchema('ENCRYPTION_KEY'),
});

export type ValidatedEnv = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    const formattedErrors = parsed.error.errors
      .map((err) => `[${err.path.join('.')}] ${err.message}`)
      .join('; ');
    throw new Error(`Khởi động thất bại do cấu hình môi trường (.env) không hợp lệ: ${formattedErrors}`);
  }
  return Object.freeze(parsed.data);
}
