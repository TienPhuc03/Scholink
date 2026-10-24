import { Observable } from 'rxjs';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  SendOtpDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  CreateUploadUrlDto,
  CompleteUploadDto,
  UpdatePassportDto,
  CreateConsentDto,
  CreateOpportunityDto,
  QueryOpportunityDto,
  CreatePreviewDto,
  SubmitApplicationDto,
} from '@shared';

export const GATEWAY_IDENTITY_GRPC = Symbol('GATEWAY_IDENTITY_GRPC');
export const GATEWAY_OPPORTUNITY_GRPC = Symbol('GATEWAY_OPPORTUNITY_GRPC');

export interface IdentityGrpcClient {
  register(data: RegisterDto): Observable<Record<string, unknown>>;
  login(data: LoginDto): Observable<Record<string, unknown>>;
  refresh(data: RefreshTokenDto): Observable<Record<string, unknown>>;
  logout(data: { userId: string; sessionId?: string }): Observable<Record<string, unknown>>;
  sendOtp(data: SendOtpDto): Observable<Record<string, unknown>>;
  verifyOtp(data: VerifyOtpDto): Observable<Record<string, unknown>>;
  forgotPassword(data: ForgotPasswordDto): Observable<Record<string, unknown>>;
  resetPassword(data: ResetPasswordDto): Observable<Record<string, unknown>>;
  getMyPassport(data: { studentId: string }): Observable<Record<string, unknown>>;
  updateMyPassport(
    data: UpdatePassportDto & { studentId: string },
  ): Observable<Record<string, unknown>>;
  createConsent(
    data: CreateConsentDto & { studentId: string },
  ): Observable<Record<string, unknown>>;
  createUploadUrl(
    data: CreateUploadUrlDto & { ownerId: string },
  ): Observable<Record<string, unknown>>;
  completeUpload(
    data: CompleteUploadDto & { ownerId: string; assetId: string },
  ): Observable<Record<string, unknown>>;
  getMediaAsset(data: {
    ownerId: string;
    assetId: string;
  }): Observable<Record<string, unknown>>;
}

export interface OpportunityGrpcClient {
  listOpportunities(data: QueryOpportunityDto): Observable<Record<string, unknown>>;
  getOpportunityById(data: { id: string }): Observable<Record<string, unknown>>;
  createOpportunity(
    data: CreateOpportunityDto & {
      actorId: string;
      actorRole: string;
      organizationId?: string;
    },
  ): Observable<Record<string, unknown>>;
  createApplicationPreview(
    data: CreatePreviewDto & { studentId: string },
  ): Observable<Record<string, unknown>>;
  getApplicationPreview(data: {
    studentId: string;
    previewId: string;
  }): Observable<Record<string, unknown>>;
  submitApplication(
    data: SubmitApplicationDto & { studentId: string },
  ): Observable<Record<string, unknown>>;
  getMyApplications(data: { studentId: string }): Observable<{ items?: unknown[] }>;
  withdrawApplication(data: {
    applicationId: string;
    studentId: string;
  }): Observable<Record<string, unknown>>;
}
