import 'package:intl/intl.dart';

enum NotificationType {
  deadlineReminder,
  applicationUpdate,
  teamInvite,
  matchSuggestion,
  system,
}

enum CalendarSyncStatus {
  notSynced,
  synced,
  failed,
  permissionDenied,
}

enum ReminderMilestone {
  sevenDays('7d', '7 ngày trước hạn', Duration(days: 7)),
  threeDays('3d', '3 ngày trước hạn', Duration(days: 3)),
  twentyFourHours('24h', '24 giờ trước hạn', Duration(hours: 24));

  final String code;
  final String label;
  final Duration leadTime;

  const ReminderMilestone(this.code, this.label, this.leadTime);

  /// Calculate trigger time for this milestone given a deadline
  DateTime calculateTriggerTime(DateTime deadline) {
    return deadline.subtract(leadTime);
  }

  /// Whether this milestone is in the future relative to now (FR-NOTI-02: chỉ tạo mốc tương lai)
  bool isFuture(DateTime deadline) {
    return calculateTriggerTime(deadline).isAfter(DateTime.now());
  }
}

/// Notification Entity with Unique notificationId (FR-NOTI-01).
class NotificationModel {
  final String notificationId; // Enforces unique ID across all notifications
  final NotificationType type;
  final String title;
  final String body;
  final String? refUrl;
  final String? opportunityId;
  final String? milestone;
  final bool isRead;
  final DateTime? readAt;
  final DateTime createdAt;

  const NotificationModel({
    required this.notificationId,
    required this.type,
    required this.title,
    required this.body,
    this.refUrl,
    this.opportunityId,
    this.milestone,
    this.isRead = false,
    this.readAt,
    required this.createdAt,
  });

  String get id => notificationId;

  String get typeDisplay {
    switch (type) {
      case NotificationType.deadlineReminder:
        return 'Nhắc Hạn';
      case NotificationType.applicationUpdate:
        return 'Hồ Sơ';
      case NotificationType.teamInvite:
        return 'Đội Thi';
      case NotificationType.matchSuggestion:
        return 'Gợi Ý';
      case NotificationType.system:
        return 'Hệ Thống';
    }
  }

  String get formattedCreatedAt {
    final DateFormat formatter = DateFormat('dd/MM/yyyy HH:mm');
    return formatter.format(createdAt.toLocal());
  }

  NotificationModel copyWith({
    String? notificationId,
    NotificationType? type,
    String? title,
    String? body,
    String? refUrl,
    String? opportunityId,
    String? milestone,
    bool? isRead,
    DateTime? readAt,
    DateTime? createdAt,
  }) {
    return NotificationModel(
      notificationId: notificationId ?? this.notificationId,
      type: type ?? this.type,
      title: title ?? this.title,
      body: body ?? this.body,
      refUrl: refUrl ?? this.refUrl,
      opportunityId: opportunityId ?? this.opportunityId,
      milestone: milestone ?? this.milestone,
      isRead: isRead ?? this.isRead,
      readAt: readAt ?? this.readAt,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    final String typeRaw = (json['type'] ?? 'SYSTEM').toString().toUpperCase();
    NotificationType type = NotificationType.system;
    if (typeRaw.contains('DEADLINE')) {
      type = NotificationType.deadlineReminder;
    } else if (typeRaw.contains('APPLICATION')) {
      type = NotificationType.applicationUpdate;
    } else if (typeRaw.contains('TEAM')) {
      type = NotificationType.teamInvite;
    } else if (typeRaw.contains('MATCH')) {
      type = NotificationType.matchSuggestion;
    }

    final String notiId = (json['notificationId'] ?? json['id'] ?? json['_id'] ?? '') as String;
    final DateTime createdAt = json['createdAt'] != null
        ? (DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now())
        : DateTime.now();
    final DateTime? readAt = json['readAt'] != null
        ? DateTime.tryParse(json['readAt'].toString())
        : null;

    return NotificationModel(
      notificationId: notiId,
      type: type,
      title: (json['title'] ?? 'Thông báo') as String,
      body: (json['body'] ?? json['message'] ?? '') as String,
      refUrl: json['refUrl'] as String?,
      opportunityId: json['opportunityId'] as String?,
      milestone: json['milestone'] as String?,
      isRead: json['isRead'] == true,
      readAt: readAt,
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'notificationId': notificationId,
        'id': notificationId,
        'type': type.name,
        'title': title,
        'body': body,
        'refUrl': refUrl,
        'opportunityId': opportunityId,
        'milestone': milestone,
        'isRead': isRead,
        'readAt': readAt?.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
      };
}

/// Model for Calendar Event with eventId deduplication key (FR-NOTI-04).
class CalendarEventRecord {
  final String eventId; // Key format: 'scholink_event_${oppId}_${milestone}'
  final String opportunityId;
  final String title;
  final DateTime deadline;
  final String milestone;
  final CalendarSyncStatus syncStatus;
  final DateTime syncedAt;

  const CalendarEventRecord({
    required this.eventId,
    required this.opportunityId,
    required this.title,
    required this.deadline,
    required this.milestone,
    required this.syncStatus,
    required this.syncedAt,
  });

  Map<String, dynamic> toJson() => <String, dynamic>{
        'eventId': eventId,
        'opportunityId': opportunityId,
        'title': title,
        'deadline': deadline.toIso8601String(),
        'milestone': milestone,
        'syncStatus': syncStatus.name,
        'syncedAt': syncedAt.toIso8601String(),
      };

  factory CalendarEventRecord.fromJson(Map<String, dynamic> json) {
    CalendarSyncStatus status = CalendarSyncStatus.notSynced;
    final String s = (json['syncStatus'] ?? '').toString();
    if (s == 'synced') status = CalendarSyncStatus.synced;
    if (s == 'failed') status = CalendarSyncStatus.failed;
    if (s == 'permissionDenied') status = CalendarSyncStatus.permissionDenied;

    return CalendarEventRecord(
      eventId: (json['eventId'] ?? '') as String,
      opportunityId: (json['opportunityId'] ?? '') as String,
      title: (json['title'] ?? '') as String,
      deadline: DateTime.tryParse(json['deadline']?.toString() ?? '') ?? DateTime.now(),
      milestone: (json['milestone'] ?? 'deadline') as String,
      syncStatus: status,
      syncedAt: DateTime.tryParse(json['syncedAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }
}

