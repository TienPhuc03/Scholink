import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPassportRepository } from '../../domain/ports/passport.repository.port';
import { Passport, Education, Certificate } from '../../domain/passport.entity';
import { Consent } from '../../domain/consent.entity';
import {
  PassportModel,
  PassportDocument,
  ConsentModel,
  ConsentDocument,
} from './passport.schema';

@Injectable()
export class MongoosePassportRepository implements IPassportRepository {
  constructor(
    @InjectModel(PassportModel.name)
    private readonly passportModel: Model<PassportDocument>,
    @InjectModel(ConsentModel.name)
    private readonly consentModel: Model<ConsentDocument>,
  ) {}

  async findByStudentId(studentId: string): Promise<Passport | null> {
    const doc = await this.passportModel.findOne({ studentId: String(studentId) }).lean().exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async save(passport: Passport): Promise<void> {
    await this.passportModel.create({
      id: passport.id,
      studentId: passport.studentId,
      fullName: passport.props.fullName,
      bio: passport.props.bio,
      avatarAssetId: passport.props.avatarAssetId,
      regionCode: passport.props.regionCode,
      education: passport.props.education,
      certificates: passport.props.certificates ? [...passport.props.certificates] : [],
      skills: passport.props.skills ? [...passport.props.skills] : [],
      achievements: passport.props.achievements ? [...passport.props.achievements] : [],
      cvAssetId: passport.props.cvAssetId,
      pitchVideoAssetId: passport.props.pitchVideoAssetId,
      isLookingForTeammate: passport.props.isLookingForTeammate,
      isOpenForScholarship: passport.props.isOpenForScholarship,
      isOpenForMentoring: passport.props.isOpenForMentoring,
      completionScore: passport.completionScore,
      scoreVersion: passport.scoreVersion,
      version: passport.version,
    });
  }

  async update(passport: Passport): Promise<void> {
    await this.passportModel
      .updateOne(
        { id: String(passport.id) },
        {
          $set: {
            fullName: passport.props.fullName,
            bio: passport.props.bio,
            avatarAssetId: passport.props.avatarAssetId,
            regionCode: passport.props.regionCode,
            education: passport.props.education,
            certificates: passport.props.certificates ? [...passport.props.certificates] : [],
            skills: passport.props.skills ? [...passport.props.skills] : [],
            achievements: passport.props.achievements ? [...passport.props.achievements] : [],
            cvAssetId: passport.props.cvAssetId,
            pitchVideoAssetId: passport.props.pitchVideoAssetId,
            isLookingForTeammate: passport.props.isLookingForTeammate,
            isOpenForScholarship: passport.props.isOpenForScholarship,
            isOpenForMentoring: passport.props.isOpenForMentoring,
            completionScore: passport.completionScore,
            scoreVersion: passport.scoreVersion,
            version: passport.version,
          },
        },
      )
      .exec();
  }

  async saveConsent(consent: Consent): Promise<void> {
    await this.consentModel.create({
      id: consent.id,
      actorId: consent.actorId,
      purpose: consent.props.purpose,
      opportunityId: consent.opportunityId,
      submissionId: consent.props.submissionId,
      previewId: consent.previewId,
      snapshotId: consent.snapshotId,
      profileVersion: consent.profileVersion,
      ruleVersion: consent.ruleVersion,
      manifestHash: consent.manifestHash,
      payloadHash: consent.payloadHash,
      expiresAt: consent.expiresAt,
    });
  }

  async findConsentById(consentId: string): Promise<Consent | null> {
    const doc = await this.consentModel.findOne({ id: String(consentId) }).lean().exec();
    if (!doc) return null;
    return new Consent(doc.id, {
      actorId: doc.actorId,
      purpose: doc.purpose as 'APPLICATION_SUBMISSION' | 'PROFILE_SHARING',
      opportunityId: doc.opportunityId,
      submissionId: doc.submissionId,
      previewId: doc.previewId,
      snapshotId: doc.snapshotId,
      profileVersion: doc.profileVersion,
      ruleVersion: doc.ruleVersion,
      manifestHash: doc.manifestHash,
      payloadHash: doc.payloadHash,
      expiresAt: new Date(doc.expiresAt),
    });
  }

  private toDomain(doc: {
    id: string;
    studentId: string;
    fullName: string;
    bio?: string;
    avatarAssetId?: string;
    regionCode?: string;
    education?: Record<string, unknown>;
    certificates?: Record<string, unknown>[];
    skills?: string[];
    achievements?: string[];
    cvAssetId?: string;
    pitchVideoAssetId?: string;
    isLookingForTeammate: boolean;
    isOpenForScholarship: boolean;
    isOpenForMentoring: boolean;
    completionScore: number;
    scoreVersion?: number;
    version: number;
  }): Passport {
    return new Passport(doc.id, {
      studentId: doc.studentId,
      profileVersion: doc.version,
      fullName: doc.fullName,
      bio: doc.bio,
      avatarAssetId: doc.avatarAssetId,
      regionCode: doc.regionCode,
      education: doc.education as unknown as Education | undefined,
      certificates: doc.certificates as unknown as Certificate[] | undefined,
      skills: doc.skills,
      achievements: doc.achievements,
      cvAssetId: doc.cvAssetId,
      pitchVideoAssetId: doc.pitchVideoAssetId,
      isLookingForTeammate: doc.isLookingForTeammate,
      isOpenForScholarship: doc.isOpenForScholarship,
      isOpenForMentoring: doc.isOpenForMentoring,
      completionScore: doc.completionScore,
      scoreVersion: doc.scoreVersion ?? 1,
    });
  }
}
