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

/// Quiet hours (FR-NOTI-03, SRS 12D): [22:00, 07:00) — same rule as the Notification Service.
const int kQuietStartHour = 22;
const int kQuietEndHour = 7;

bool isInQuietHours(DateTime t) => t.hour >= kQuietStartHour || t.hour < kQuietEndHour;

enum ReminderMilestone {
  sevenDays('7d', '7 ngày trước hạn', Duration(days: 7)),
  threeDays('3d', '3 ngày trước hạn', Duration(days: 3)),
  twentyFourHours('24h', '24 giờ trước hạn', Duration(hours: 24));

  final String code;
  final String label;
  final Duration leadTime;

  const ReminderMilestone(this.code, this.label, this.leadTime);

  static ReminderMilestone? fromCode(String code) {
    for (final ReminderMilestone m in values) {
      if (m.code == code) return m;
    }
    return null;
  }

  /// Calculate trigger time for this milestone given a deadline
  DateTime calculateTriggerTime(DateTime deadline) {
    return deadline.subtract(leadTime);
  }

  /// Whether this milestone is in the future relative to now (FR-NOTI-02: chỉ tạo mốc tương lai)
  bool isFuture(DateTime deadline, {DateTime? now}) {
    return calculateTriggerTime(deadline).isAfter(now ?? DateTime.now());
  }

  /// When the alarm should ring, in device time, after the quiet-hours rule (FR-NOTI-03):
  /// inside [22:00, 07:00) it moves to 07:00 if that is still before the deadline, otherwise to
  /// 21:59 the evening before; null when no valid moment is left (the milestone is skipped).
  DateTime? plannedAlarm(DateTime deadline, {DateTime? now}) {
    final DateTime current = now ?? DateTime.now();
    final DateTime due = calculateTriggerTime(deadline).toLocal();
    if (!due.isAfter(current)) return null;
    if (!isInQuietHours(due)) return due;

    final DateTime quietStart = due.hour >= kQuietStartHour
        ? DateTime(due.year, due.month, due.day, kQuietStartHour)
        : DateTime(due.year, due.month, due.day - 1, kQuietStartHour);
    final DateTime quietEnd = DateTime(quietStart.year, quietStart.month, quietStart.day + 1, kQuietEndHour);
    if (quietEnd.isBefore(deadline)) return quietEnd;
    final DateTime advanced = quietStart.subtract(const Duration(minutes: 1));
    return advanced.isAfter(current) ? advanced : null;
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

  /// `/applications/<id>` deep link of an application update (opens TV1's application detail).
  String? get applicationId => _refId('applications');

  String? get teamId => _refId('teams');

  /// Opportunity this notification is about: explicit field or `/opportunities/<id>` link.
  String? get targetOpportunityId => opportunityId ?? _refId('opportunities');

  String? _refId(String segment) {
    final String? url = refUrl;
    if (url == null) return null;
    final List<String> parts = Uri.tryParse(url)?.pathSegments ?? <String>[];
    final int i = parts.indexOf(segment);
    return i >= 0 && i + 1 < parts.length && parts[i + 1].isNotEmpty ? parts[i + 1] : null;
  }

  bool get hasTarget => targetOpportunityId != null || applicationId != null || teamId != null;

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

  static NotificationType _typeOf(String raw) {
    final String t = raw.toUpperCase();
    // Server: DEADLINE_REMINDER (entity) / REMINDER (older worker); app cache: deadlineReminder.
    if (t.contains('DEADLINE') || t.contains('REMINDER')) return NotificationType.deadlineReminder;
    if (t.contains('APPLICATION')) return NotificationType.applicationUpdate;
    if (t.contains('TEAM')) return NotificationType.teamInvite;
    if (t.contains('MATCH')) return NotificationType.matchSuggestion;
    return NotificationType.system;
  }

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    final String notiId = (json['notificationId'] ?? json['id'] ?? json['_id'] ?? '').toString();
    final DateTime createdAt = DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now();
    final DateTime? readAt = json['readAt'] != null ? DateTime.tryParse(json['readAt'].toString()) : null;

    return NotificationModel(
      notificationId: notiId,
      type: _typeOf((json['type'] ?? 'SYSTEM').toString()),
      title: (json['title'] ?? 'Thông báo').toString(),
      body: (json['body'] ?? json['message'] ?? '').toString(),
      refUrl: json['refUrl']?.toString(),
      opportunityId: json['opportunityId']?.toString(),
      milestone: json['milestone']?.toString(),
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

/// Notification channels and timezone of the signed-in user (NOTI-03, F29).
class NotificationPreferences {
  final String timezone;
  final bool pushEnabled;
  final bool emailEnabled;
  final String quietStart;
  final String quietEnd;
  final int preferenceVersion;

  const NotificationPreferences({
    this.timezone = 'Asia/Ho_Chi_Minh',
    this.pushEnabled = true,
    this.emailEnabled = true,
    this.quietStart = '22:00',
    this.quietEnd = '07:00',
    this.preferenceVersion = 1,
  });

  /// The in-app inbox cannot be turned off: reminders and application updates must stay visible.
  bool get inAppEnabled => true;

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) => NotificationPreferences(
        timezone: (json['timezone'] ?? 'Asia/Ho_Chi_Minh').toString(),
        pushEnabled: json['pushEnabled'] != false,
        emailEnabled: json['emailEnabled'] != false,
        quietStart: (json['quietStart'] ?? '22:00').toString(),
        quietEnd: (json['quietEnd'] ?? '07:00').toString(),
        preferenceVersion: int.tryParse('${json['preferenceVersion'] ?? 1}') ?? 1,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'timezone': timezone,
        'pushEnabled': pushEnabled,
        'emailEnabled': emailEnabled,
        'quietStart': quietStart,
        'quietEnd': quietEnd,
        'preferenceVersion': preferenceVersion,
      };

  NotificationPreferences copyWith({String? timezone, bool? pushEnabled, bool? emailEnabled}) =>
      NotificationPreferences(
        timezone: timezone ?? this.timezone,
        pushEnabled: pushEnabled ?? this.pushEnabled,
        emailEnabled: emailEnabled ?? this.emailEnabled,
        quietStart: quietStart,
        quietEnd: quietEnd,
        preferenceVersion: preferenceVersion,
      );
}

/// Timezones offered in the settings screen (Flutter cannot read the device's IANA name).
const List<String> kSupportedTimezones = <String>[
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

/// Device calendar record of one opportunity (FR-NOTI-04): one event per opportunity, its
/// milestones are alarms on that event. [eventId] is the Scholink key that prevents duplicates,
/// [nativeEventId] the id the device calendar gave the event.
class CalendarEventRecord {
  final String eventId; // Key format: 'scholink_event_${oppId}'
  final String opportunityId;
  final String title;
  final DateTime deadline;
  final String milestone;
  final List<String> milestones;
  final List<int> reminderMinutes;
  final String? nativeEventId;
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
    this.milestones = const <String>[],
    this.reminderMinutes = const <int>[],
    this.nativeEventId,
  });

  static String keyFor(String opportunityId) => 'scholink_event_$opportunityId';

  Map<String, dynamic> toJson() => <String, dynamic>{
        'eventId': eventId,
        'opportunityId': opportunityId,
        'title': title,
        'deadline': deadline.toIso8601String(),
        'milestone': milestone,
        'milestones': milestones,
        'reminderMinutes': reminderMinutes,
        'nativeEventId': nativeEventId,
        'syncStatus': syncStatus.name,
        'syncedAt': syncedAt.toIso8601String(),
      };

  factory CalendarEventRecord.fromJson(Map<String, dynamic> json) {
    CalendarSyncStatus status = CalendarSyncStatus.notSynced;
    final String s = (json['syncStatus'] ?? '').toString();
    if (s == 'synced') status = CalendarSyncStatus.synced;
    if (s == 'failed') status = CalendarSyncStatus.failed;
    if (s == 'permissionDenied') status = CalendarSyncStatus.permissionDenied;

    List<T> listOf<T>(dynamic raw, T Function(dynamic) f) => raw is List ? raw.map(f).toList() : <T>[];

    return CalendarEventRecord(
      eventId: (json['eventId'] ?? '').toString(),
      opportunityId: (json['opportunityId'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      deadline: DateTime.tryParse(json['deadline']?.toString() ?? '')?.toLocal() ?? DateTime.now(),
      milestone: (json['milestone'] ?? 'deadline').toString(),
      milestones: listOf<String>(json['milestones'], (dynamic e) => e.toString()),
      reminderMinutes: listOf<int>(json['reminderMinutes'], (dynamic e) => int.tryParse('$e') ?? 0),
      nativeEventId: json['nativeEventId']?.toString(),
      syncStatus: status,
      syncedAt: DateTime.tryParse(json['syncedAt']?.toString() ?? '')?.toLocal() ?? DateTime.now(),
    );
  }
}
