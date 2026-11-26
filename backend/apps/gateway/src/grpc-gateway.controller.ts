import { Controller, Get, Post, Body, Param, Inject, OnModuleInit, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { JwtAuthGuard, RolesGuard, Roles, AuthenticatedUser, DomainException } from '@shared';

interface CollaborationGrpcService {
  prepareSubmission(data: any): Observable<any>;
  validateReservation(data: any): Observable<any>;
  confirmSubmission(data: any): Observable<any>;
  abortSubmission(data: any): Observable<any>;
  sendChatMessage(data: any): Observable<any>;
  getTeamDetails(data: any): Observable<any>;
}

interface IdentityGrpcService {
  getProfileSnapshot(data: any): Observable<any>;
  validateConsent(data: any): Observable<any>;
  verifyToken(data: any): Observable<any>;
}

@ApiTags('High-Load gRPC Gateways (Gateway ↔ Internal Services)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/grpc')
export class GrpcGatewayController implements OnModuleInit {
  private collaborationGrpc!: CollaborationGrpcService;
  private identityGrpc!: IdentityGrpcService;

  constructor(
    @Inject('COLLABORATION_GRPC_PACKAGE') private readonly collaborationClient: ClientGrpc,
    @Inject('IDENTITY_GRPC_PACKAGE') private readonly identityClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.collaborationGrpc = this.collaborationClient.getService<CollaborationGrpcService>('CollaborationGrpcService');
    this.identityGrpc = this.identityClient.getService<IdentityGrpcService>('IdentityGrpcService');
  }

  @Get('teams/:id/details')
  @Roles('STUDENT', 'ORGANIZER', 'ADMIN')
  @ApiOperation({ summary: 'Lấy chi tiết đội thi thông qua gRPC Binary Stream tốc độ cao' })
  async getTeamDetailsViaGrpc(@Param('id') teamId: string) {
    const start = performance.now();
    const result = await firstValueFrom(this.collaborationGrpc.getTeamDetails({ team_id: teamId }));
    const durationMs = (performance.now() - start).toFixed(2);
    return {
      protocol: 'gRPC/HTTP2',
      durationMs: `${durationMs}ms`,
      data: result,
    };
  }

  @Post('teams/:id/prepare-submission')
  @Roles('STUDENT')
  @ApiOperation({ summary: 'Khóa đội thi (Roster Freeze) & Giữ chỗ nộp hồ sơ qua gRPC' })
  async prepareSubmissionViaGrpc(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') teamId: string,
    @Body() body: { competitionId: string; payloadHash?: string },
  ) {
    const start = performance.now();
    const result = await firstValueFrom(
      this.collaborationGrpc.prepareSubmission({
        team_id: teamId,
        leader_id: req.user.userId,
        competition_id: body.competitionId,
        payload_hash: body.payloadHash || 'hash_sample',
      }),
    );
    const durationMs = (performance.now() - start).toFixed(2);
    return {
      protocol: 'gRPC/HTTP2',
      durationMs: `${durationMs}ms`,
      data: result,
    };
  }

  @Get('students/:id/snapshot')
  @Roles('STUDENT', 'ADMIN')
  @ApiOperation({ summary: 'Lấy Passport Snapshot bất biến qua gRPC từ Identity Service' })
  async getStudentSnapshotViaGrpc(
    @Req() req: { user: AuthenticatedUser },
    @Param('id') studentId: string,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== studentId) {
      throw DomainException.forbidden('Bạn không có quyền xem snapshot của sinh viên khác');
    }
    const start = performance.now();
    const result = await firstValueFrom(
      this.identityGrpc.getProfileSnapshot({
        student_id: studentId,
        caller_service: 'api-gateway',
      }),
    );
    const durationMs = (performance.now() - start).toFixed(2);
    return {
      protocol: 'gRPC/HTTP2',
      durationMs: `${durationMs}ms`,
      data: result,
    };
  }
}
