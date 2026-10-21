import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { IApplicationRepository, APPLICATION_REPOSITORY } from '../../domain/ports/application.repository.port';
import { IOpportunityRepository, OPPORTUNITY_REPOSITORY } from '../../domain/ports/opportunity.repository.port';
import { Application, ApplicationStatus } from '../../domain/application.entity';
import { SubmitApplicationDto, UpdateApplicationStatusDto } from '../dtos/opportunity.dto';
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

    const applicationId = `app_${crypto.randomUUID()}`;
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

  // ==========================================
  // F24: ORGANIZER KANBAN & STATUS MANAGEMENT
  // ==========================================
  async getOpportunityKanban(opportunityId: string) {
    const opportunity = await this.opportunityRepo.findById(opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội (Học bổng / Cuộc thi)');
    }

    const applications = await this.applicationRepo.findManyByOpportunity(opportunityId);

    const columns: Record<string, any[]> = {
      SUBMITTED: [],
      REVIEWING: [],
      SHORTLISTED: [],
      INTERVIEW: [],
      ACCEPTED: [],
      REJECTED: [],
    };

    for (const app of applications) {
      const col = columns[app.status] ? app.status : 'SUBMITTED';
      columns[col].push({
        ...app.props,
        id: app.id,
        version: app.version,
      });
    }

    return {
      opportunityId,
      opportunityTitle: opportunity.props.title,
      totalApplications: applications.length,
      columns: {
        APPLIED: columns.SUBMITTED,
        REVIEWING: columns.REVIEWING,
        SHORTLISTED: columns.SHORTLISTED,
        INTERVIEW: columns.INTERVIEW,
        ACCEPTED: columns.ACCEPTED,
        REJECTED: columns.REJECTED,
      },
    };
  }

  async updateStatus(applicationId: string, organizerId: string, dto: UpdateApplicationStatusDto) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    if (dto.expectedVersion !== undefined && application.version !== dto.expectedVersion) {
      throw new DomainException(
        ErrorCode.VERSION_MISMATCH,
        `Xung đột phiên bản dữ liệu (Expected: ${dto.expectedVersion}, Current: ${application.version}). Vui lòng tải lại bảng Kanban.`,
        409,
      );
    }

    // Update status
    (application.props as any).status = dto.status as ApplicationStatus;
    application.incrementVersion();

    await this.applicationRepo.update(application);

    return {
      applicationId: application.id,
      status: application.status,
      version: application.version,
      updatedAt: new Date().toISOString(),
    };
  }
}
