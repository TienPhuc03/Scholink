import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
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
  validateEnv,
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
  DataDeletionTrackingModel,
  DataDeletionTrackingSchema,
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
import { MediaUseCase } from './application/use-cases/media.use-case';
import { ObjectStorageService } from './infrastructure/storage/object-storage.service';
import {
  IdentityOutboxRelayService,
  IDENTITY_OPPORTUNITY_GRPC,
} from './infrastructure/workers/identity-outbox-relay.service';
import { AuthController } from './presentation/auth.controller';
import { ProfileController } from './presentation/profile.controller';
import { AdminOrganizationController } from './presentation/admin-organization.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    DatabaseModule.forService('IDENTITY_DB_NAME', 'scholink_identity'),
    SharedModule,
    // F40: the outbox relay hands `user.deleted` to Opportunity for snapshot retention.
    ClientsModule.registerAsync([
      {
        name: IDENTITY_OPPORTUNITY_GRPC,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'scholink.opportunity',
            protoPath: join(process.cwd(), 'libs/shared/src/protos/opportunity.proto'),
            url: config.get<string>('OPPORTUNITY_GRPC_URL', 'localhost:50052'),
          },
        }),
      },
    ]),
    MongooseModule.forFeature([
      { name: UserModel.name, schema: UserSchema },
      { name: SessionModel.name, schema: SessionSchema },
      { name: OtpRecordModel.name, schema: OtpRecordSchema },
      { name: OrganizationModel.name, schema: OrganizationSchema },
      { name: OrganizationMembershipModel.name, schema: OrganizationMembershipSchema },
      { name: DataDeletionTrackingModel.name, schema: DataDeletionTrackingSchema },
      { name: PassportModel.name, schema: PassportSchema },
      { name: MediaAssetModel.name, schema: MediaAssetSchema },
      { name: ConsentModel.name, schema: ConsentSchema },
      { name: OutboxModel.name, schema: OutboxSchema },
      { name: ProcessedEventModel.name, schema: ProcessedEventSchema },
      { name: IdempotencyKeyModel.name, schema: IdempotencyKeySchema },
    ]),
  ],
  controllers: [AuthController, ProfileController, AdminOrganizationController],
  providers: [
    AuthUseCase,
    MediaUseCase,
    ObjectStorageService,
    IdentityOutboxRelayService,
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
  exports: [AuthUseCase, MediaUseCase, PassportUseCase, OrganizationUseCase, USER_REPOSITORY, PASSPORT_REPOSITORY],
})
export class IdentityServiceModule {}
