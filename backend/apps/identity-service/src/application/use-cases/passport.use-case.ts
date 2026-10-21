import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
import { UpdatePassportDto, CreateConsentDto } from '../dtos/passport.dto';
import { Consent } from '../../domain/consent.entity';
import { DomainException, ErrorCode, CryptoService } from '@shared';

@Injectable()
export class PassportUseCase {
  constructor(
    @Inject(PASSPORT_REPOSITORY) private readonly passportRepo: IPassportRepository,
    private readonly cryptoService: CryptoService,
  ) {}

  async getMyPassport(studentId: string) {
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }
    return {
      ...passport.props,
      id: passport.id,
      version: passport.version,
    };
  }

  async updateMyPassport(studentId: string, dto: UpdatePassportDto) {
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }

    passport.updateProfile(dto as any);
    await this.passportRepo.update(passport);

    return {
      ...passport.props,
      id: passport.id,
      version: passport.version,
    };
  }

  async createConsent(studentId: string, dto: CreateConsentDto) {
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }

    if (passport.version !== dto.profileVersion) {
      throw new DomainException(
        ErrorCode.SNAPSHOT_STALE,
        'Hồ sơ đã thay đổi, vui lòng tạo preview mới trước khi xác nhận',
        409,
      );
    }

    const consentId = crypto.randomUUID();
    const consent = new Consent(consentId, {
      actorId: studentId,
      purpose: 'APPLICATION_SUBMISSION',
      opportunityId: dto.opportunityId,
      submissionId: dto.submissionId,
      previewId: dto.previewId,
      snapshotId: dto.snapshotId,
      profileVersion: dto.profileVersion,
      ruleVersion: dto.ruleVersion,
      manifestHash: dto.manifestHash,
      payloadHash: dto.payloadHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    return {
      consentId: consent.id,
      previewId: consent.previewId,
      snapshotId: consent.snapshotId,
      payloadHash: consent.payloadHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }
}
