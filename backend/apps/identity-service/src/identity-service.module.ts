import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SharedModule,
  DatabaseModule,
  OutboxModel,
  OutboxSchema,
  ProcessedEventModel,
  ProcessedEventSchema,
  IdempotencyKeyModel,
  IdempotencyKeySchema,
} from '@shared';
import {
  UserModel,
  UserSchema,
  SessionModel,
  SessionSchema,
  OtpRecordModel,
  OtpRecordSchema,
  OrganizationModel,
  OrganizationSchema,
  OrganizationMembershipModel,
  OrganizationMembershipSchema,
} from './infrastructure/persistence/user.schema';
import {
  PassportModel,
  PassportSchema,
  MediaAssetModel,
  MediaAssetSchema,
  ConsentModel,
  ConsentSchema,
} from './infrastructure/persistence/passport.schema';
import { USER_REPOSITORY } from './domain/ports/user.repository.port';
import { PASSPORT_REPOSITORY } from './domain/ports/passport.repository.port';
import { MongooseUserRepository } from './infrastructure/persistence/user.repository';
import { MongoosePassportRepository } from './infrastructure/persistence/passport.repository';
import { AuthUseCase } from './application/use-cases/auth.use-case';
import { PassportUseCase } from './application/use-cases/passport.use-case';
import { OrganizationUseCase } from './application/use-cases/organization.use-case';
import { AuthController } from './presentation/auth.controller';
import { ProfileController } from './presentation/profile.controller';
import { AdminOrganizationController } from './presentation/admin-organization.controller';
import { IdentityGrpcController } from './presentation/identity-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule.forService('IDENTITY_DB_NAME', 'scholink_identity'),
    SharedModule,
    MongooseModule.forFeature([
      { name: UserModel.name, schema: UserSchema },
      { name: SessionModel.name, schema: SessionSchema },
      { name: OtpRecordModel.name, schema: OtpRecordSchema },
      { name: OrganizationModel.name, schema: OrganizationSchema },
      { name: OrganizationMembershipModel.name, schema: OrganizationMembershipSchema },
      { name: PassportModel.name, schema: PassportSchema },
      { name: MediaAssetModel.name, schema: MediaAssetSchema },
      { name: ConsentModel.name, schema: ConsentSchema },
      { name: OutboxModel.name, schema: OutboxSchema },
      { name: ProcessedEventModel.name, schema: ProcessedEventSchema },
      { name: IdempotencyKeyModel.name, schema: IdempotencyKeySchema },
    ]),
  ],
  controllers: [AuthController, ProfileController, AdminOrganizationController, IdentityGrpcController],
  providers: [
    AuthUseCase,
    PassportUseCase,
    OrganizationUseCase,
    {
      provide: USER_REPOSITORY,
      useClass: MongooseUserRepository,
    },
    {
      provide: PASSPORT_REPOSITORY,
      useClass: MongoosePassportRepository,
    },
  ],
  exports: [AuthUseCase, PassportUseCase, OrganizationUseCase, USER_REPOSITORY, PASSPORT_REPOSITORY],
})
export class IdentityServiceModule {}
