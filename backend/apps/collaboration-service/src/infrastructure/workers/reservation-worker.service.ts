import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ITeamRepository, TEAM_REPOSITORY } from '../../domain/ports/team.repository.port';

@Injectable()
export class ReservationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teamRepo: ITeamRepository,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 Khởi động Background Worker quét Reservation quá hạn (F33)...');
    // Run every 30 seconds
    this.timer = setInterval(() => this.cleanupExpiredReservations(), 30000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async cleanupExpiredReservations() {
    try {
      const expired = await this.teamRepo.findExpiredPendingReservations();
      if (expired.length > 0) {
        this.logger.log(`[Worker] Tìm thấy ${expired.length} reservation quá hạn lease. Bắt đầu tự động abort...`);
        for (const res of expired) {
          res.abort();
          await this.teamRepo.updateReservation(res);

          const team = await this.teamRepo.findById(res.teamId);
          if (team) {
            team.abortSubmission(res.id);
            await this.teamRepo.update(team);
          }
          this.logger.log(`[Worker] Đã giải phóng Roster Freeze cho đội ${res.teamId} (Reservation: ${res.id})`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[Worker Error] Quét reservation lỗi: ${err.message}`);
    }
  }
}
