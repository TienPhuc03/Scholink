import 'package:intl/intl.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import '../opportunity/opportunity_model.dart';
import 'notification_model.dart';
import 'notification_repository.dart';

/// ViewModel managing state and operations for Notifications Inbox & Device Calendar Sync.
/// Complies with Tuần 3 (F20) and Tuần 4 (F29) - NOTI-01/02/03/04:
/// - Inbox displays unique notificationId; offline shows the saved inbox with its time
/// - Reminders with milestones (7d, 3d, 24h), quiet hours [22:00, 07:00)
/// - One device-calendar event per opportunity (no duplicates)
/// - Permission rejection NEVER reports success
/// - Channels (push/email) and timezone saved on the server
class NotificationViewModel extends BaseViewModel {
  final NotificationRepository _repository;

  List<NotificationModel> _items = <NotificationModel>[];
  int _unreadCount = 0;
  String _selectedFilter = 'ALL'; // 'ALL' or 'UNREAD'
  bool _showingCache = false;
  bool _isRefreshing = false;
  String? _refreshError;
  String? _syncedAtText;
  int _pendingReads = 0;
  bool _disposed = false;

  final Map<String, CalendarEventRecord> _calendarRecords = <String, CalendarEventRecord>{};
  String? _lastSyncMessage;
  bool _lastSyncIsSuccess = false;

  NotificationPreferences? _preferences;
  bool _preferencesFromCache = false;
  bool _preferencesLoading = false;
  bool _preferencesSaving = false;
  String? _preferencesError;

  NotificationViewModel(this._repository);

  List<NotificationModel> get items {
    if (_selectedFilter == 'UNREAD') {
      return _items.where((NotificationModel n) => !n.isRead).toList();
    }
    return List<NotificationModel>.unmodifiable(_items);
  }

  int get unreadCount => _unreadCount;
  String get selectedFilter => _selectedFilter;
  bool get isShowingCache => _showingCache;
  bool get isRefreshing => _isRefreshing;
  String? get refreshError => _refreshError;
  String? get syncedAtText => _syncedAtText;

  /// "Read" marks waiting for the network.
  int get pendingReads => _pendingReads;
  String? get lastSyncMessage => _lastSyncMessage;
  bool get lastSyncIsSuccess => _lastSyncIsSuccess;

  NotificationPreferences? get preferences => _preferences;
  bool get preferencesFromCache => _preferencesFromCache;
  bool get preferencesLoading => _preferencesLoading;
  bool get preferencesSaving => _preferencesSaving;
  String? get preferencesError => _preferencesError;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _recount() => _unreadCount = _items.where((NotificationModel n) => !n.isRead).length;

  Future<void> loadNotifications() async {
    final bool keepOnScreen = _items.isNotEmpty;
    if (keepOnScreen) {
      _isRefreshing = true;
      _notify();
    } else {
      setLoading();
    }

    final Result<InboxSnapshot, Failure> result = await _repository.getNotifications();
    if (_disposed) return;
    _isRefreshing = false;

    result.fold(
      onSuccess: (InboxSnapshot snap) {
        _items = List<NotificationModel>.of(snap.items);
        _recount();
        _showingCache = snap.fromCache;
        _refreshError = snap.refreshFailure?.message;
        _syncedAtText = snap.syncedAt != null ? DateFormat('dd/MM/yyyy HH:mm').format(snap.syncedAt!.toLocal()) : null;
        if (!snap.fromCache) _pendingReads = 0;
        setSuccess();
      },
      onFailure: (Failure failure) {
        if (keepOnScreen) {
          _refreshError = failure.message;
          setSuccess();
        } else {
          setError(failure is NetworkFailure
              ? 'Không có kết nối mạng và chưa có thông báo nào được lưu trên máy.'
              : failure.message);
        }
      },
    );
  }

  void setFilter(String filter) {
    if (_selectedFilter != filter) {
      _selectedFilter = filter;
      _notify();
    }
  }

  NotificationModel? findById(String id) {
    for (final NotificationModel n in _items) {
      if (n.notificationId == id) return n;
    }
    return null;
  }

  Future<void> markAsRead(String notificationId) async {
    final int index = _items.indexWhere((NotificationModel n) => n.notificationId == notificationId);
    if (index != -1) {
      _items[index] = _items[index].copyWith(isRead: true, readAt: DateTime.now());
      _recount();
      _notify();
    }
    final bool delivered = await _repository.markAsRead(notificationId);
    if (!delivered) {
      _pendingReads++;
      _notify();
    }
  }

  Future<void> markAllAsRead() async {
    _items = _items.map((NotificationModel n) => n.isRead ? n : n.copyWith(isRead: true, readAt: DateTime.now())).toList();
    _unreadCount = 0;
    _notify();
    final bool delivered = await _repository.markAllAsRead();
    if (!delivered) {
      _pendingReads = _items.length;
      _notify();
    }
  }

  // ------------------------------------------------------------------ preferences (NOTI-03)

  Future<void> loadPreferences() async {
    _preferencesLoading = true;
    _preferencesError = null;
    _notify();
    final Result<({NotificationPreferences prefs, bool fromCache}), Failure> res = await _repository.getPreferences();
    if (_disposed) return;
    _preferencesLoading = false;
    res.fold(
      onSuccess: (({NotificationPreferences prefs, bool fromCache}) r) {
        _preferences = r.prefs;
        _preferencesFromCache = r.fromCache;
      },
      onFailure: (Failure f) => _preferencesError = f.message,
    );
    _notify();
  }

  /// Saves the channels / timezone. Turning push on asks for the OS permission first; a refusal
  /// keeps push off and is returned as the failure (never shown as saved).
  Future<Failure?> savePreferences({String? timezone, bool? pushEnabled, bool? emailEnabled}) async {
    if (pushEnabled == true && !(_preferences?.pushEnabled ?? false)) {
      final Failure? denied = (await _repository.requestNotificationPermission()).errorOrNull;
      if (denied != null) {
        _preferencesError = denied.message;
        _notify();
        return denied;
      }
    }
    _preferencesSaving = true;
    _preferencesError = null;
    _notify();
    final Result<NotificationPreferences, Failure> res = await _repository.updatePreferences(
      timezone: timezone,
      pushEnabled: pushEnabled,
      emailEnabled: emailEnabled,
    );
    if (_disposed) return res.errorOrNull;
    _preferencesSaving = false;
    final Failure? failure = res.errorOrNull;
    if (failure == null) {
      _preferences = res.dataOrNull;
      _preferencesFromCache = false;
    } else {
      _preferencesError = failure.message;
    }
    _notify();
    return failure;
  }

  Future<bool> hasNotificationPermission() => _repository.hasNotificationPermission();

  // ------------------------------------------------------------------ device calendar (NOTI-04)

  CalendarSyncStatus getCalendarSyncStatus(String opportunityId) {
    return _calendarRecords[opportunityId]?.syncStatus ?? CalendarSyncStatus.notSynced;
  }

  CalendarEventRecord? calendarRecordFor(String opportunityId) => _calendarRecords[opportunityId];

  Future<void> loadCalendarRecord(String opportunityId) async {
    final CalendarEventRecord? record = await _repository.getCalendarRecord(opportunityId);
    if (record != null) {
      _calendarRecords[opportunityId] = record;
    } else {
      _calendarRecords.remove(opportunityId);
    }
    _notify();
  }

  /// Synchronize Opportunity Deadlines to Device Calendar
  ///
  /// CRITICAL RULE: "Từ chối quyền không báo thành công; eventId chống trùng"
  Future<bool> syncOpportunityToCalendar(
    OpportunityModel opportunity,
    List<ReminderMilestone> milestones,
  ) async {
    final Result<CalendarEventRecord, Failure> result = await _repository.syncOpportunityToCalendar(
      opportunity: opportunity,
      milestones: milestones,
    );
    if (_disposed) return result.isSuccess;

    return result.fold(
      onSuccess: (CalendarEventRecord record) {
        _calendarRecords[opportunity.id] = record;
        _lastSyncIsSuccess = true;
        final int alarms = record.milestones.length;
        _lastSyncMessage = alarms > 0
            ? 'Đã lưu hạn chót vào lịch thiết bị kèm $alarms lời nhắc. Lưu lại lần nữa sẽ cập nhật đúng sự kiện này, không tạo trùng.'
            : 'Đã lưu hạn chót vào lịch thiết bị (các mốc nhắc đã chọn đều đã qua).';
        _notify();
        return true;
      },
      onFailure: (Failure failure) {
        // PERMISSION DENIED / ERROR: MUST NOT REPORT SUCCESS!
        _calendarRecords[opportunity.id] = CalendarEventRecord(
          eventId: CalendarEventRecord.keyFor(opportunity.id),
          opportunityId: opportunity.id,
          title: opportunity.title,
          deadline: opportunity.registerDeadlineAt ?? DateTime.now(),
          milestone: 'failed',
          syncStatus: failure is PermissionDeniedFailure ? CalendarSyncStatus.permissionDenied : CalendarSyncStatus.failed,
          syncedAt: DateTime.now(),
          nativeEventId: _calendarRecords[opportunity.id]?.nativeEventId,
        );
        _lastSyncIsSuccess = false;
        _lastSyncMessage = failure.message;
        _notify();
        return false;
      },
    );
  }

  Future<bool> removeFromCalendar(String opportunityId) async {
    final Failure? f = (await _repository.removeFromCalendar(opportunityId)).errorOrNull;
    if (_disposed) return f == null;
    if (f == null) {
      _calendarRecords.remove(opportunityId);
      _lastSyncIsSuccess = true;
      _lastSyncMessage = 'Đã xóa sự kiện của cơ hội này khỏi lịch thiết bị.';
    } else {
      _lastSyncIsSuccess = false;
      _lastSyncMessage = f.message;
    }
    _notify();
    return f == null;
  }

  void clearSyncMessage() {
    _lastSyncMessage = null;
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
