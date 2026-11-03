import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { SharedModule, DatabaseModule } from '@shared';
import {
  TeamModel,
  TeamSchema,
  ActiveMembershipModel,
  ActiveMembershipSchema,
  JoinRequestModel,
  JoinRequestSchema,
  SubmissionReservationModel,
  SubmissionReservationSchema,
} from './infrastructure/persistence/team.schema';
import {
  ChatRoomModel,
  ChatRoomSchema,
  MessageModel,
  MessageSchema,
  OutboxModel,
  OutboxSchema,
  ReadReceiptModel,
  ReadReceiptSchema,
} from './infrastructure/persistence/chat.schema';
import { TEAM_REPOSITORY } from './domain/ports/team.repository.port';
import { CHAT_REPOSITORY } from './domain/ports/chat.repository.port';
import { OPPORTUNITY_CLIENT } from './domain/ports/opportunity-client.port';
import { IDENTITY_CLIENT } from './domain/ports/identity-client.port';
import { MongooseTeamRepository } from './infrastructure/persistence/team.repository';
import { MongooseChatRepository } from './infrastructure/persistence/chat.repository';
import { OpportunityGrpcClient } from './infrastructure/clients/opportunity-grpc.client';
import { IdentityGrpcClient } from './infrastructure/clients/identity-grpc.client';
import { TeamUseCase } from './application/use-cases/team.use-case';
import { ChatUseCase } from './application/use-cases/chat.use-case';
import { ReservationWorkerService } from './infrastructure/workers/reservation-worker.service';
import { ChatOutboxWorkerService } from './infrastructure/workers/chat-outbox-worker.service';
import { TeamController } from './presentation/team.controller';
import { ChatController } from './presentation/chat.controller';
import { CollaborationGrpcController } from './presentation/collaboration-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule.forService('COLLABORATION_DB_NAME', 'scholink_collaboration'),
    SharedModule,
    ClientsModule.registerAsync([
      {
        name: 'OPPORTUNITY_GRPC_PACKAGE',
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
      {
        name: 'IDENTITY_GRPC_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'scholink.identity',
            protoPath: join(process.cwd(), 'libs/shared/src/protos/identity.proto'),
            url: config.get<string>('IDENTITY_GRPC_URL', 'localhost:50051'),
          },
        }),
      },
    ]),
    MongooseModule.forFeature([
      { name: TeamModel.name, schema: TeamSchema },
      { name: ActiveMembershipModel.name, schema: ActiveMembershipSchema },
      { name: JoinRequestModel.name, schema: JoinRequestSchema },
      { name: SubmissionReservationModel.name, schema: SubmissionReservationSchema },
      { name: ChatRoomModel.name, schema: ChatRoomSchema },
      { name: MessageModel.name, schema: MessageSchema },
      { name: OutboxModel.name, schema: OutboxSchema },
      { name: ReadReceiptModel.name, schema: ReadReceiptSchema },
    ]),
  ],
  controllers: [TeamController, ChatController, CollaborationGrpcController],
  providers: [
    TeamUseCase,
    ChatUseCase,
    ReservationWorkerService,
    ChatOutboxWorkerService,
    {
      provide: TEAM_REPOSITORY,
      useClass: MongooseTeamRepository,
    },
    {
      provide: CHAT_REPOSITORY,
      useClass: MongooseChatRepository,
    },
    {
      provide: OPPORTUNITY_CLIENT,
      useClass: OpportunityGrpcClient,
    },
    {
      provide: IDENTITY_CLIENT,
      useClass: IdentityGrpcClient,
    },
  ],
  exports: [
    TeamUseCase,
    ChatUseCase,
    TEAM_REPOSITORY,
    CHAT_REPOSITORY,
    OPPORTUNITY_CLIENT,
    IDENTITY_CLIENT,
    ReservationWorkerService,
    ChatOutboxWorkerService,
  ],
})
export class CollaborationServiceModule {}
