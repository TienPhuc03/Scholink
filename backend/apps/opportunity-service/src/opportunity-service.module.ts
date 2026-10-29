import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { join } from "path";
import {
  SharedModule,
  DatabaseModule,
  OutboxModel,
  OutboxSchema,
  ProcessedEventModel,
  ProcessedEventSchema,
  IdempotencyKeyModel,
  IdempotencyKeySchema,
} from "@shared";
import {
  OpportunityModel,
  OpportunitySchema,
  OpportunityRevisionModel,
  OpportunityRevisionSchema,
  BookmarkModel,
  BookmarkSchema,
  ExternalRegistrationModel,
  ExternalRegistrationSchema,
} from "./infrastructure/persistence/opportunity.schema";
import {
  SubmissionPreviewModel,
  SubmissionPreviewSchema,
  ApplicationModel,
  ApplicationSchema,
  ApplicationRevisionModel,
  ApplicationRevisionSchema,
  ApplicationEventModel,
  ApplicationEventSchema,
  ApplicationMemberModel,
  ApplicationMemberSchema,
  SubmissionIntentModel,
  SubmissionIntentSchema,
} from "./infrastructure/persistence/application.schema";
import { OPPORTUNITY_REPOSITORY } from "./domain/ports/opportunity.repository.port";
import { APPLICATION_REPOSITORY } from "./domain/ports/application.repository.port";
import { MongooseOpportunityRepository } from "./infrastructure/persistence/opportunity.repository";
import { MongooseApplicationRepository } from "./infrastructure/persistence/application.repository";
import { OpportunityUseCase } from "./application/use-cases/opportunity.use-case";
import {
  ApplicationUseCase,
  IDENTITY_GRPC_CLIENT,
} from "./application/use-cases/application.use-case";
import { OpportunityController } from "./presentation/opportunity.controller";
import { ApplicationController } from "./presentation/application.controller";
import { CrawlerUseCase } from "./application/use-cases/crawler.use-case";
import { AdminOpportunityController } from "./presentation/admin-opportunity.controller";
import { BookmarkUseCase } from "./application/use-cases/bookmark.use-case";
import { EventEmitterModule } from "@nestjs/event-emitter";

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    DatabaseModule.forService("OPPORTUNITY_DB_NAME", "scholink_opportunity"),
    SharedModule,
    ClientsModule.registerAsync([
      {
        name: IDENTITY_GRPC_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: "scholink.identity",
            protoPath: join(
              process.cwd(),
              "libs/shared/src/protos/identity.proto",
            ),
            url: config.get<string>("IDENTITY_GRPC_URL", "localhost:50051"),
          },
        }),
      },
    ]),
    MongooseModule.forFeature([
      { name: OpportunityModel.name, schema: OpportunitySchema },
      {
        name: OpportunityRevisionModel.name,
        schema: OpportunityRevisionSchema,
      },
      { name: BookmarkModel.name, schema: BookmarkSchema },
      {
        name: ExternalRegistrationModel.name,
        schema: ExternalRegistrationSchema,
      },
      { name: SubmissionPreviewModel.name, schema: SubmissionPreviewSchema },
      { name: ApplicationModel.name, schema: ApplicationSchema },
      {
        name: ApplicationRevisionModel.name,
        schema: ApplicationRevisionSchema,
      },
      { name: ApplicationEventModel.name, schema: ApplicationEventSchema },
      { name: ApplicationMemberModel.name, schema: ApplicationMemberSchema },
      { name: SubmissionIntentModel.name, schema: SubmissionIntentSchema },
      { name: OutboxModel.name, schema: OutboxSchema },
      { name: ProcessedEventModel.name, schema: ProcessedEventSchema },
      { name: IdempotencyKeyModel.name, schema: IdempotencyKeySchema },
    ]),
  ],
  controllers: [
    OpportunityController,
    ApplicationController,
    AdminOpportunityController,
  ],
  providers: [
    OpportunityUseCase,
    ApplicationUseCase,
    BookmarkUseCase,
    CrawlerUseCase,
    {
      provide: OPPORTUNITY_REPOSITORY,
      useClass: MongooseOpportunityRepository,
    },
    {
      provide: APPLICATION_REPOSITORY,
      useClass: MongooseApplicationRepository,
    },
  ],
  exports: [
    OpportunityUseCase,
    ApplicationUseCase,
    OPPORTUNITY_REPOSITORY,
    APPLICATION_REPOSITORY,
  ],
})
export class OpportunityServiceModule {}
