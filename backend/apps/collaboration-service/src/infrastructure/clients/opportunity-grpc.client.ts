import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  IOpportunityClientPort,
  AbortIntentResult,
  CompetitionInfo,
} from '../../domain/ports/opportunity-client.port';

@Injectable()
export class OpportunityGrpcClient implements IOpportunityClientPort, OnModuleInit {
  private readonly logger = new Logger(OpportunityGrpcClient.name);
  private grpcService?: any;

  constructor(
    @Optional()
    @Inject('OPPORTUNITY_GRPC_PACKAGE')
    private readonly clientGrpc?: ClientGrpc,
    private readonly configService?: ConfigService,
  ) {}

  onModuleInit() {
    if (this.clientGrpc) {
      try {
        this.grpcService = this.clientGrpc.getService<any>('OpportunityGrpcService');
      } catch (err: any) {
        this.logger.warn(`Could not resolve OpportunityGrpcService: ${err.message}`);
      }
    }
  }

  async getCompetition(id: string): Promise<CompetitionInfo | null | undefined> {
    if (!this.grpcService || typeof this.grpcService.getOpportunityById !== 'function') return undefined;
    try {
      const res: any = await firstValueFrom(this.grpcService.getOpportunityById({ id }));
      if (!res?.id) return null;
      return { id: res.id, title: res.title || '', type: res.type || '', status: res.status || '' };
    } catch (err: any) {
      // gRPC NOT_FOUND = 5
      if (err?.code === 5 || /not found|không tồn tại/i.test(err?.message ?? '')) return null;
      this.logger.warn(`Opportunity gRPC getOpportunityById failed: ${err.message}`);
      return undefined;
    }
  }

  async abortSubmissionIntent(params: {
    teamId: string;
    reservationId: string;
    fencingToken: number;
    reason?: string;
  }): Promise<AbortIntentResult> {
    if (this.grpcService && typeof this.grpcService.abortSubmissionIntent === 'function') {
      try {
        const res: any = await firstValueFrom(
          this.grpcService.abortSubmissionIntent({
            team_id: params.teamId,
            reservation_id: params.reservationId,
            fencing_token: params.fencingToken,
            reason: params.reason || '',
          }),
        );
        return {
          outcome: res.outcome as 'ABORTED' | 'COMMITTED',
          message: res.message,
        };
      } catch (err: any) {
        this.logger.error(`Opportunity gRPC abortSubmissionIntent failed: ${err.message}`);
        throw err; // Re-throw so worker retains lock and retries on connection loss!
      }
    }

    // Default mock/fallback in standalone test environments without live gRPC network
    this.logger.debug(`[MockFallback] abortSubmissionIntent executed for reservation ${params.reservationId}`);
    return {
      outcome: 'ABORTED',
      message: 'Intent aborted successfully (fallback)',
    };
  }
}
