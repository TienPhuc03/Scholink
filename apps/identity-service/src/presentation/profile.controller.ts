import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PassportUseCase } from '../application/use-cases/passport.use-case';
import { MediaUseCase } from '../application/use-cases/media.use-case';
import {
  UpdatePassportDto,
  CreateConsentDto,
  CreateUploadUrlDto,
  CompleteUploadDto,
} from '../application/dtos/passport.dto';
import { GrpcExceptionFilter } from '@shared';

@UseFilters(GrpcExceptionFilter)
@Controller()
export class ProfileController {
  constructor(
    private readonly passportUseCase: PassportUseCase,
    private readonly mediaUseCase: MediaUseCase,
  ) {}

  @GrpcMethod('IdentityGrpcService', 'GetMyPassport')
  async getMyPassport(data: { studentId: string }) {
    return this.passportUseCase.getMyPassport(data.studentId);
  }

  @GrpcMethod('IdentityGrpcService', 'UpdateMyPassport')
  async updateMyPassport(data: UpdatePassportDto & { studentId: string }) {
    const { studentId, ...dto } = data;
    return this.passportUseCase.updateMyPassport(studentId, dto);
  }

  @GrpcMethod('IdentityGrpcService', 'CreateConsent')
  async createConsent(data: CreateConsentDto & { studentId: string }) {
    const { studentId, ...dto } = data;
    return this.passportUseCase.createConsent(studentId, dto);
  }

  @GrpcMethod('IdentityGrpcService', 'CreateUploadUrl')
  async createUploadUrl(data: CreateUploadUrlDto & { ownerId: string }) {
    const { ownerId, ...dto } = data;
    return this.mediaUseCase.createUploadUrl(ownerId, dto);
  }

  @GrpcMethod('IdentityGrpcService', 'CompleteUpload')
  async completeUpload(
    data: CompleteUploadDto & { ownerId: string; assetId: string },
  ) {
    const { ownerId, assetId, ...dto } = data;
    return this.mediaUseCase.completeUpload(ownerId, assetId, dto);
  }

  @GrpcMethod('IdentityGrpcService', 'GetMediaAsset')
  async getMediaAsset(data: { ownerId: string; assetId: string }) {
    return this.mediaUseCase.getMediaAsset(data.ownerId, data.assetId);
  }

  @GrpcMethod('IdentityGrpcService', 'GetProfileSnapshot')
  async getProfileSnapshot(data: { studentId: string; attachmentIds?: string[] }) {
    return this.passportUseCase.getProfileSnapshot(data.studentId, data.attachmentIds ?? []);
  }

  @GrpcMethod('IdentityGrpcService', 'ValidateConsent')
  async validateConsent(data: {
    studentId: string;
    consentId: string;
    previewId: string;
    snapshotId: string;
    opportunityId: string;
    expectedRuleVersion: number;
    expectedPayloadHash: string;
    attachmentIds?: string[];
    requiredScope?: string[];
  }) {
    return this.passportUseCase.validateConsent(data);
  }
}
