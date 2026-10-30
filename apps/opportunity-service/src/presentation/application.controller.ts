import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApplicationUseCase } from '../application/use-cases/application.use-case';
import {
  CreatePreviewDto,
  SubmitApplicationDto,
} from '../application/dtos/opportunity.dto';
import { GrpcExceptionFilter } from '@shared';

@UseFilters(GrpcExceptionFilter)
@Controller()
export class ApplicationController {
  constructor(private readonly applicationUseCase: ApplicationUseCase) {}

  @GrpcMethod('OpportunityGrpcService', 'CreateApplicationPreview')
  async createPreview(data: CreatePreviewDto & { studentId: string }) {
    const { studentId, ...dto } = data;
    return this.applicationUseCase.createPreview(studentId, dto);
  }

  @GrpcMethod('OpportunityGrpcService', 'GetApplicationPreview')
  async getPreview(data: { studentId: string; previewId: string }) {
    return this.applicationUseCase.getPreview(data.studentId, data.previewId);
  }

  @GrpcMethod('OpportunityGrpcService', 'SubmitApplication')
  async submit(data: SubmitApplicationDto & { studentId: string }) {
    const { studentId, ...dto } = data;
    return this.applicationUseCase.submit(studentId, dto);
  }

  @GrpcMethod('OpportunityGrpcService', 'GetMyApplications')
  async getMyApplications(data: { studentId: string }) {
    const items = await this.applicationUseCase.getMyApplications(data.studentId);
    return { items };
  }

  @GrpcMethod('OpportunityGrpcService', 'GetApplicationById')
  async getApplicationById(data: { applicationId: string; studentId: string }) {
    return this.applicationUseCase.getApplicationById(data.applicationId, data.studentId);
  }

  @GrpcMethod('OpportunityGrpcService', 'WithdrawApplication')
  async withdraw(data: { applicationId: string; studentId: string }) {
    return this.applicationUseCase.withdraw(data.applicationId, data.studentId);
  }

  @GrpcMethod('OpportunityGrpcService', 'CheckReadiness')
  async checkReadiness(data: { studentId: string; opportunityId: string }) {
    return this.applicationUseCase.checkReadiness(data.studentId, data.opportunityId);
  }
}
