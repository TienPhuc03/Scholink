import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TeamUseCase } from '../application/use-cases/team.use-case';
import { CreateTeamDto, CreateTeamDtoSchema } from '../application/dtos/collaboration.dto';
import { ZodValidationPipe, JwtAuthGuard, RolesGuard, IdempotencyGuard, Roles, Idempotent, AuthenticatedUser } from '@shared';

@ApiTags('Team & Collaboration (Collaboration Microservice)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, IdempotencyGuard)
@Controller('api/v1/teams')
export class TeamController {
  constructor(private readonly teamUseCase: TeamUseCase) {}

  @Post()
  @Roles('STUDENT')
  @Idempotent()
  @ApiOperation({ summary: 'Tạo đội thi mới cho cuộc thi' })
  @ApiResponse({ status: 201, description: 'Tạo đội thành công' })
  async createTeam(
    @Req() req: { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(CreateTeamDtoSchema)) dto: CreateTeamDto,
  ) {
    return this.teamUseCase.createTeam(req.user.userId, dto);
  }

  @Post(':id/join')
  @Roles('STUDENT')
  @Idempotent()
  @ApiOperation({ summary: 'Gia nhập đội thi' })
  @ApiResponse({ status: 200, description: 'Gia nhập đội thành công' })
  async joinTeam(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
  ) {
    return this.teamUseCase.joinTeam(teamId, req.user.userId);
  }

  @Post(':id/leave')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Rời đội thi' })
  @ApiResponse({ status: 200, description: 'Rời đội thành công' })
  async leaveTeam(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
  ) {
    return this.teamUseCase.leaveTeam(teamId, req.user.userId);
  }

  @Get('competitions/:competitionId')
  @ApiOperation({ summary: 'Lấy danh sách các đội thi của một cuộc thi' })
  @ApiResponse({ status: 200, description: 'Danh sách đội' })
  async getCompetitionTeams(@Param('competitionId') competitionId: string) {
    return this.teamUseCase.getCompetitionTeams(competitionId);
  }
}
