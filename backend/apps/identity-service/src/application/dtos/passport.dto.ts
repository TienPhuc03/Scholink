/**
 * Single source of truth: Contract DTO dùng chung giữa API Gateway và Identity Service
 * được định nghĩa tại `@shared` để tránh lệch schema giữa các tầng.
 */
export {
  UpdatePassportDtoSchema,
  CreateConsentDtoSchema,
  CertificateInputSchema,
  MediaCategorySchema,
  CreateUploadUrlDtoSchema,
  CompleteUploadDtoSchema,
} from '@shared';
export type {
  UpdatePassportDto,
  CreateConsentDto,
  CertificateInput,
  MediaCategory,
  CreateUploadUrlDto,
  CompleteUploadDto,
} from '@shared';
