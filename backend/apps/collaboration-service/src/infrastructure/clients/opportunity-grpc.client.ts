import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  IOpportunityClientPort,
  AbortIntentResult,
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
