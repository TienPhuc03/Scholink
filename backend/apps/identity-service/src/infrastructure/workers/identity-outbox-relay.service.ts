import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { firstValueFrom, Observable } from 'rxjs';
import { OutboxDocument, OutboxEvent, OutboxHandler, OutboxModel, relayOutboxBatch } from '@shared';

export const IDENTITY_OPPORTUNITY_GRPC = 'IDENTITY_OPPORTUNITY_GRPC';

interface RetentionClient {
  applySnapshotRetentionDecision(data: {
    studentId: string;
    decision: string;
    trackingId?: string;
  }): Observable<Record<string, unknown>>;
}

/**
 * F40 / D06: relays Identity's outbox. `user.deleted` is the deletion consumer hand-off: the
 * Opportunity service keeps or purges the student's submitted snapshots per the decision taken
 * at deletion time. That call is idempotent per student, so an at-least-once retry is safe.
 */
@Injectable()
export class IdentityOutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdentityOutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private retention!: RetentionClient;

  constructor(
    @InjectModel(OutboxModel.name) private readonly outbox: Model<OutboxDocument>,
    @Inject(IDENTITY_OPPORTUNITY_GRPC) private readonly opportunityClient: ClientGrpc,
  ) {}

  readonly handlers: Readonly<Record<string, OutboxHandler>> = {
    'user.deleted': (event: OutboxEvent) => this.onUserDeleted(event),
  };

  onModuleInit() {
    this.retention = this.opportunityClient.getService<RetentionClient>('OpportunityGrpcService');
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 5000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await relayOutboxBatch(this.outbox, this.handlers, this.logger);
    } catch (err: any) {
      this.logger.error(`[Outbox] Không quét được outbox: ${err.message}`);
    } finally {
      this.running = false;
    }
  }

  private async onUserDeleted(event: OutboxEvent) {
    const studentId = String(event.data.userId ?? event.aggregateId);
    const decision = event.data.snapshotDecision === 'PURGE' ? 'PURGE' : 'RETAIN';
    await firstValueFrom(
      this.retention.applySnapshotRetentionDecision({
        studentId,
        decision,
        trackingId: String(event.data.trackingId ?? event.correlationId),
      }),
    );
    this.logger.log(`[Outbox] user.deleted ${studentId}: snapshot ${decision} đã chuyển sang Opportunity.`);
  }
}
