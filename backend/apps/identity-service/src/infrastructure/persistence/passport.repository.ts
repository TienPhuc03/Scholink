import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPassportRepository } from '../../domain/ports/passport.repository.port';
import { Passport } from '../../domain/passport.entity';
import { PassportModel, PassportDocument } from './passport.schema';

@Injectable()
export class MongoosePassportRepository implements IPassportRepository {
  constructor(
    @InjectModel(PassportModel.name)
    private readonly passportModel: Model<PassportDocument>,
  ) {}

  async findByStudentId(studentId: string): Promise<Passport | null> {
    const doc = await this.passportModel.findOne({ studentId }).exec();
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
      education: passport.props.education,
      certificates: passport.props.certificates,
      skills: passport.props.skills,
      achievements: passport.props.achievements,
      cvAssetId: passport.props.cvAssetId,
      pitchVideoAssetId: passport.props.pitchVideoAssetId,
      isLookingForTeammate: passport.props.isLookingForTeammate,
      isOpenForScholarship: passport.props.isOpenForScholarship,
      isOpenForMentoring: passport.props.isOpenForMentoring,
      completionScore: passport.completionScore,
      version: passport.version,
    });
  }

  async update(passport: Passport): Promise<void> {
    await this.passportModel
      .updateOne(
        { id: passport.id },
        {
          fullName: passport.props.fullName,
          bio: passport.props.bio,
          avatarAssetId: passport.props.avatarAssetId,
          education: passport.props.education,
          certificates: passport.props.certificates,
          skills: passport.props.skills,
          achievements: passport.props.achievements,
          cvAssetId: passport.props.cvAssetId,
          pitchVideoAssetId: passport.props.pitchVideoAssetId,
          isLookingForTeammate: passport.props.isLookingForTeammate,
          isOpenForScholarship: passport.props.isOpenForScholarship,
          isOpenForMentoring: passport.props.isOpenForMentoring,
          completionScore: passport.completionScore,
          version: passport.version,
        },
      )
      .exec();
  }

  private toDomain(doc: PassportDocument): Passport {
    return new Passport(doc.id, {
      studentId: doc.studentId,
      profileVersion: doc.version,
      fullName: doc.fullName,
      bio: doc.bio,
      avatarAssetId: doc.avatarAssetId,
      education: doc.education as any,
      certificates: doc.certificates as any,
      skills: doc.skills,
      achievements: doc.achievements,
      cvAssetId: doc.cvAssetId,
      pitchVideoAssetId: doc.pitchVideoAssetId,
      isLookingForTeammate: doc.isLookingForTeammate,
      isOpenForScholarship: doc.isOpenForScholarship,
      isOpenForMentoring: doc.isOpenForMentoring,
      completionScore: doc.completionScore,
    });
  }
}
