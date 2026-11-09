// backend/apps/notification-service/src/application/services/quiet-hours.service.ts
import { Injectable } from "@nestjs/common";
import moment = require("moment-timezone");

@Injectable()
export class QuietHoursService {
  calculatePlannedSendAt(
    dueAt: Date,
    deadline: Date,
    timezone: string,
  ): { plannedSendAt: Date | null; reason: string } {
    const due = moment(dueAt).tz(timezone);
    const dl = moment(deadline).tz(timezone);

    const quietStart = due.clone().set({ hour: 22, minute: 0, second: 0 });
    const quietEnd = due
      .clone()
      .add(1, "days")
      .set({ hour: 7, minute: 0, second: 0 });

    // Nếu dueAt rơi vào sau 00:00 và trước 07:00, dời quietStart lùi lại 1 ngày
    if (due.hour() < 7) {
      quietStart.subtract(1, "days");
      quietEnd.subtract(1, "days");
    }

    // 1. Ngoài giờ yên lặng và trước hạn
    if (!due.isBetween(quietStart, quietEnd, null, "[)") && due.isBefore(dl)) {
      return { plannedSendAt: due.toDate(), reason: "NORMAL" };
    }

    // 2. Trong giờ yên lặng, quietEnd kế tiếp < deadline
    if (quietEnd.isBefore(dl)) {
      return { plannedSendAt: quietEnd.toDate(), reason: "DEFERRED_QUIET" };
    }

    // 3. quietEnd >= deadline: Lùi về trước giờ yên lặng 1 phút
    const advancedTime = quietStart.clone().subtract(1, "minutes");
    if (advancedTime.isAfter(moment())) {
      return {
        plannedSendAt: advancedTime.toDate(),
        reason: "ADVANCED_QUIET_DEADLINE",
      };
    }

    // 4. Không còn thời điểm hợp lệ trước giờ yên lặng
    return { plannedSendAt: null, reason: "SUPPRESSED_QUIET_DEADLINE" };
  }
}
