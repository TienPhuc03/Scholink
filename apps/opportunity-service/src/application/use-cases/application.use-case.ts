import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { IApplicationRepository, APPLICATION_REPOSITORY } from '../../domain/ports/application.repository.port';
import { IOpportunityRepository, OPPORTUNITY_REPOSITORY } from '../../domain/ports/opportunity.repository.port';
import { Application } from '../../domain/application.entity';
import { SubmitApplicationDto } from '../dtos/opportunity.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class ApplicationUseCase {
  constructor(
    @Inject(APPLICATION_REPOSITORY)
    private readonly applicationRepo: IApplicationRepository,
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
  ) {}

  async submit(studentId: string, dto: SubmitApplicationDto) {
    const opportunity = await this.opportunityRepo.findById(dto.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    if (!opportunity.isRegistrationOpen()) {
      throw new DomainException(ErrorCode.DEADLINE_PASSED, 'Đã hết hạn đăng ký nộp hồ sơ', 409);
    }

    const existing = await this.applicationRepo.findByOpportunityAndStudent(
      dto.opportunityId,
      studentId,
    );
    if (existing && existing.status !== 'WITHDRAWN') {
      throw new DomainException(
        ErrorCode.ALREADY_APPLIED,
        'Bạn đã nộp hồ sơ cho cơ hội này rồi',
        409,
      );
    }

    const applicationId = crypto.randomUUID();
    const application = new Application(applicationId, {
      opportunityId: dto.opportunityId,
      studentId,
      teamId: dto.teamId,
      submissionType: dto.submissionType,
      status: 'SUBMITTED',
      previewId: dto.previewId,
      snapshotId: dto.snapshotId,
      profileVersion: dto.profileVersion,
      payloadHash: dto.payloadHash,
      consentId: dto.consentId,
      submittedAt: new Date(),
      revision: 1,
    });

    await this.applicationRepo.save(application);

    return {
      applicationId: application.id,
      status: application.status,
      submittedAt: application.props.submittedAt,
      revision: application.props.revision,
    };
  }

  async getMyApplications(studentId: string) {
    const applications = await this.applicationRepo.findManyByStudent(studentId);
    return applications.map((app) => ({
      ...app.props,
      id: app.id,
      version: app.version,
    }));
  }

  async withdraw(applicationId: string, studentId: string) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    if (application.studentId !== studentId) {
      throw DomainException.forbidden();
    }

    application.withdraw();
    await this.applicationRepo.update(application);

    return {
      applicationId: application.id,
      status: application.status,
    };
  }
}
