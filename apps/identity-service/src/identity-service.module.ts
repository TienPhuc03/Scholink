import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule, DatabaseModule } from '@shared';
import { UserModel, UserSchema } from './infrastructure/persistence/user.schema';
import { PassportModel, PassportSchema } from './infrastructure/persistence/passport.schema';
import { USER_REPOSITORY } from './domain/ports/user.repository.port';
import { PASSPORT_REPOSITORY } from './domain/ports/passport.repository.port';
import { MongooseUserRepository } from './infrastructure/persistence/user.repository';
import { MongoosePassportRepository } from './infrastructure/persistence/passport.repository';
import { AuthUseCase } from './application/use-cases/auth.use-case';
import { PassportUseCase } from './application/use-cases/passport.use-case';
import { AuthController } from './presentation/auth.controller';
import { ProfileController } from './presentation/profile.controller';

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
      { name: PassportModel.name, schema: PassportSchema },
    ]),
  ],
  controllers: [AuthController, ProfileController],
  providers: [
    AuthUseCase,
    PassportUseCase,
    {
      provide: USER_REPOSITORY,
      useClass: MongooseUserRepository,
    },
    {
      provide: PASSPORT_REPOSITORY,
      useClass: MongoosePassportRepository,
    },
  ],
  exports: [AuthUseCase, PassportUseCase, USER_REPOSITORY, PASSPORT_REPOSITORY],
})
export class IdentityServiceModule {}
