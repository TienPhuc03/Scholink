import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule, DatabaseModule } from '@shared';
import { TeamModel, TeamSchema } from './infrastructure/persistence/team.schema';
import { ChatRoomModel, ChatRoomSchema, MessageModel, MessageSchema } from './infrastructure/persistence/chat.schema';
import { TEAM_REPOSITORY } from './domain/ports/team.repository.port';
import { CHAT_REPOSITORY } from './domain/ports/chat.repository.port';
import { MongooseTeamRepository } from './infrastructure/persistence/team.repository';
import { MongooseChatRepository } from './infrastructure/persistence/chat.repository';
import { TeamUseCase } from './application/use-cases/team.use-case';
import { ChatUseCase } from './application/use-cases/chat.use-case';
import { TeamController } from './presentation/team.controller';
import { ChatController } from './presentation/chat.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule.forService('COLLABORATION_DB_NAME', 'scholink_collaboration'),
    SharedModule,
    MongooseModule.forFeature([
      { name: TeamModel.name, schema: TeamSchema },
      { name: ChatRoomModel.name, schema: ChatRoomSchema },
      { name: MessageModel.name, schema: MessageSchema },
    ]),
  ],
  controllers: [TeamController, ChatController],
  providers: [
    TeamUseCase,
    ChatUseCase,
    {
      provide: TEAM_REPOSITORY,
      useClass: MongooseTeamRepository,
    },
    {
      provide: CHAT_REPOSITORY,
      useClass: MongooseChatRepository,
    },
  ],
  exports: [TeamUseCase, ChatUseCase, TEAM_REPOSITORY, CHAT_REPOSITORY],
})
export class CollaborationServiceModule {}
