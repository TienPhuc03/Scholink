import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MediaCategory } from '@shared';
import { IPassportRepository } from '../../domain/ports/passport.repository.port';
import { Passport, Education, Certificate } from '../../domain/passport.entity';
import { Consent } from '../../domain/consent.entity';
import { MediaAsset, MediaAssetStatus } from '../../domain/media-asset.entity';
import {
  PassportModel,
  PassportDocument,
  ConsentModel,
  ConsentDocument,
  MediaAssetModel,
  MediaAssetDocument,
} from './passport.schema';

@Injectable()
export class MongoosePassportRepository implements IPassportRepository {
  constructor(
    @InjectModel(PassportModel.name)
    private readonly passportModel: Model<PassportDocument>,
    @InjectModel(ConsentModel.name)
    private readonly consentModel: Model<ConsentDocument>,
    @InjectModel(MediaAssetModel.name)
    private readonly mediaAssetModel: Model<MediaAssetDocument>,
  ) {}

  async findByStudentId(studentId: string): Promise<Passport | null> {
    const doc = await this.passportModel
      .findOne({ studentId: { $eq: String(studentId) } })
      .lean()
      .exec();
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
        { id: { $eq: String(passport.id) } },
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
      scope: [...consent.scope],
      expiresAt: consent.expiresAt,
    });
  }

  async findConsentById(consentId: string): Promise<Consent | null> {
    const doc = await this.consentModel
      .findOne({ id: { $eq: String(consentId) } })
      .lean()
      .exec();
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
      scope: doc.scope,
      expiresAt: new Date(doc.expiresAt),
    });
  }

  async saveMediaAsset(asset: MediaAsset): Promise<void> {
    await this.mediaAssetModel.create({
      id: asset.id,
      ownerId: asset.ownerId,
      category: asset.category,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      objectKey: asset.objectKey,
      status: asset.status,
      version: asset.version,
    });
  }

  async updateMediaAsset(asset: MediaAsset): Promise<void> {
    await this.mediaAssetModel
      .updateOne(
        { id: { $eq: String(asset.id) } },
        {
          $set: {
            sizeBytes: asset.sizeBytes,
            sha256: asset.sha256,
            status: asset.status,
            version: asset.version,
          },
        },
      )
      .exec();
  }

  async findMediaAssetById(assetId: string): Promise<MediaAsset | null> {
    const doc = await this.mediaAssetModel
      .findOne({ id: { $eq: String(assetId) } })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toMediaAssetDomain(doc);
  }

  async findMediaAssetsByIds(assetIds: readonly string[]): Promise<MediaAsset[]> {
    if (assetIds.length === 0) return [];
    const safeIds = assetIds.map((id) => String(id));
    const docs = await this.mediaAssetModel
      .find({ id: { $in: safeIds } })
      .lean()
      .exec();
    return docs.map((doc) => this.toMediaAssetDomain(doc));
  }

  private toMediaAssetDomain(doc: {
    id: string;
    ownerId: string;
    category: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    objectKey: string;
    status: string;
    version: number;
  }): MediaAsset {
    return new MediaAsset(doc.id, {
      ownerId: doc.ownerId,
      category: doc.category as MediaCategory,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      sha256: doc.sha256,
      objectKey: doc.objectKey,
      status: doc.status as MediaAssetStatus,
      version: doc.version,
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
