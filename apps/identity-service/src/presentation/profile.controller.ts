import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PassportUseCase } from '../application/use-cases/passport.use-case';
import { UpdatePassportDto, CreateConsentDto } from '../application/dtos/passport.dto';
import { GrpcExceptionFilter } from '@shared';

@UseFilters(GrpcExceptionFilter)
@Controller()
export class ProfileController {
  constructor(private readonly passportUseCase: PassportUseCase) {}

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
  }) {
    return this.passportUseCase.validateConsent(data);
  }
}
