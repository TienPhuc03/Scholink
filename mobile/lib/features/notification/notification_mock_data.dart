import 'notification_model.dart';

/// Pre-populated mock notifications for Inbox demo and testing (FR-NOTI-01).
abstract final class NotificationMockData {
  static List<NotificationModel> getMockNotifications() {
    final DateTime now = DateTime.now();

    return <NotificationModel>[
      // 1. DEADLINE REMINDER 7 DAYS
      NotificationModel(
        notificationId: 'noti-001',
        type: NotificationType.deadlineReminder,
        title: 'Nhắc hạn: Cuộc thi Scholink Hackathon 2026',
        body: 'Cuộc thi "Scholink Hackathon 2026" sắp đóng cổng đăng ký trong 7 ngày tới. Hãy hoàn thiện đội thi và nộp hồ sơ trước thời hạn!',
        opportunityId: 'opp-comp-001',
        milestone: '7d',
        isRead: false,
        createdAt: now.subtract(const Duration(minutes: 30)),
      ),

      // 2. DEADLINE REMINDER 24 HOURS
      NotificationModel(
        notificationId: 'noti-002',
        type: NotificationType.deadlineReminder,
        title: 'Gấp: Học bổng Tiếp sức Ước mơ sắp hết hạn!',
        body: 'Chỉ còn chưa đầy 24 giờ để hoàn tất đơn đăng ký Học bổng Tiếp sức Ước mơ. Đừng bỏ lỡ cơ hội nhận tài trợ 50% học phí!',
        opportunityId: 'opp-schol-003',
        milestone: '24h',
        isRead: false,
        createdAt: now.subtract(const Duration(hours: 3)),
      ),

      // 3. APPLICATION UPDATE
      NotificationModel(
        notificationId: 'noti-003',
        type: NotificationType.applicationUpdate,
        title: 'Hồ sơ đã được xét duyệt: Tech Talent 2026',
        body: 'Ban tuyển chọn FPT đã xem xét hồ sơ số của bạn và chuyển trạng thái sang [SHORTLISTED]. Bạn được mời tham gia vòng phỏng vấn chuyên môn.',
        opportunityId: 'opp-schol-001',
        refUrl: '/applications/app-001',
        isRead: true,
        readAt: now.subtract(const Duration(hours: 10)),
        createdAt: now.subtract(const Duration(days: 1)),
      ),

      // 4. TEAM INVITE
      NotificationModel(
        notificationId: 'noti-004',
        type: NotificationType.teamInvite,
        title: 'Lời mời gia nhập Đội thi: CyberNinjas',
        body: 'Trưởng nhóm Trần Quang Huy đã gửi lời mời bạn tham gia đội "CyberNinjas" trong cuộc thi CyberShield 2026 với vai trò Reverse Engineer.',
        opportunityId: 'opp-comp-002',
        refUrl: '/teams/team-002',
        isRead: true,
        readAt: now.subtract(const Duration(days: 1)),
        createdAt: now.subtract(const Duration(days: 2)),
      ),

      // 5. SYSTEM NOTICE
      NotificationModel(
        notificationId: 'noti-005',
        type: NotificationType.system,
        title: 'Chào mừng bạn đến với Scholink Mobile 2026!',
        body: 'Hệ thống đã kích hoạt tính năng đồng bộ lịch thiết bị tự động và quản lý mốc nhắc hạn thông minh theo múi giờ địa phương.',
        isRead: true,
        readAt: now.subtract(const Duration(days: 3)),
        createdAt: now.subtract(const Duration(days: 3)),
      ),
    ];
  }
}

