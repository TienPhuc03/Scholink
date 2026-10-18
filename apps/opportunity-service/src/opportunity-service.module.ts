import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule, DatabaseModule } from '@shared';
import { OpportunityModel, OpportunitySchema } from './infrastructure/persistence/opportunity.schema';
import { ApplicationModel, ApplicationSchema } from './infrastructure/persistence/application.schema';
import { OPPORTUNITY_REPOSITORY } from './domain/ports/opportunity.repository.port';
import { APPLICATION_REPOSITORY } from './domain/ports/application.repository.port';
import { MongooseOpportunityRepository } from './infrastructure/persistence/opportunity.repository';
import { MongooseApplicationRepository } from './infrastructure/persistence/application.repository';
import { OpportunityUseCase } from './application/use-cases/opportunity.use-case';
import { ApplicationUseCase } from './application/use-cases/application.use-case';
import { OpportunityController } from './presentation/opportunity.controller';
import { ApplicationController } from './presentation/application.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule.forService('OPPORTUNITY_DB_NAME', 'scholink_opportunity'),
    SharedModule,
    MongooseModule.forFeature([
      { name: OpportunityModel.name, schema: OpportunitySchema },
      { name: ApplicationModel.name, schema: ApplicationSchema },
    ]),
  ],
  controllers: [OpportunityController, ApplicationController],
  providers: [
    OpportunityUseCase,
    ApplicationUseCase,
    {
      provide: OPPORTUNITY_REPOSITORY,
      useClass: MongooseOpportunityRepository,
    },
    {
      provide: APPLICATION_REPOSITORY,
      useClass: MongooseApplicationRepository,
    },
  ],
  exports: [OpportunityUseCase, ApplicationUseCase, OPPORTUNITY_REPOSITORY, APPLICATION_REPOSITORY],
})
export class OpportunityServiceModule {}
