import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ITeamRepository, TEAM_REPOSITORY } from '../../domain/ports/team.repository.port';
import {
  IOpportunityClientPort,
  OPPORTUNITY_CLIENT,
} from '../../domain/ports/opportunity-client.port';

@Injectable()
export class ReservationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teamRepo: ITeamRepository,
    @Inject(OPPORTUNITY_CLIENT) private readonly opportunityClient: IOpportunityClientPort,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 Khởi động Background Worker quét Reservation quá hạn (SCHOL-20 F33)...');
    // Run every 10 seconds
    this.timer = setInterval(() => this.cleanupExpiredReservations(), 10000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Process expired pending reservations.
   * Public to allow explicit trigger in automated tests.
   */
  async cleanupExpiredReservations(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;
    try {
      const expired = await this.teamRepo.findExpiredPendingReservations();
      if (expired.length === 0) {
        return 0;
      }

      this.logger.log(`[Worker] Tìm thấy ${expired.length} reservation quá hạn lease. Bắt đầu đối chiếu với Opportunity Service...`);

      for (const res of expired) {
        try {
          // SCHOL-20 requirement 5: Worker timeout calls Opportunity AbortSubmissionIntent
          const intentResult = await this.opportunityClient.abortSubmissionIntent({
            teamId: res.teamId,
            reservationId: res.id,
            fencingToken: res.fencingToken,
            reason: 'Lease expired on collaboration service',
          });

          if (intentResult.outcome === 'COMMITTED') {
            // Reconcile: COMMITTED đối chiếu Application
            this.logger.log(`[Worker] Opportunity đã COMMITTED application cho reservation ${res.id}. Reconcile xác nhận đội...`);
            res.confirm();
            await this.teamRepo.updateReservation(res);

            const team = await this.teamRepo.findById(res.teamId);
            if (team && team.status === 'SUBMITTING' && team.currentReservationId === res.id) {
              team.confirmSubmission(res.id);
              await this.teamRepo.update(team);
            }
          } else {
            // abort thắng mới mở khóa
            this.logger.log(`[Worker] Opportunity xác nhận ABORTED cho reservation ${res.id}. Mở khóa Roster Freeze...`);
            res.abort();
            await this.teamRepo.updateReservation(res);

            const team = await this.teamRepo.findById(res.teamId);
            if (team && team.status === 'SUBMITTING' && team.currentReservationId === res.id) {
              team.abortSubmission(res.id);
              await this.teamRepo.update(team);
            }
          }
          processedCount++;
        } catch (netErr: any) {
          // SCHOL-20 requirement 5: mất kết nối giữ khóa retry (không mở khóa nếu lỗi mạng)
          this.logger.warn(`[Worker] Mất kết nối tới Opportunity Service khi gọi abortSubmissionIntent cho reservation ${res.id}: ${netErr.message}. GIỮ KHÓA VÀ RETRY CHU KỲ SAU.`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[Worker Error] Quét reservation lỗi: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }
}
