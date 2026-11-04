import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import '../opportunity/opportunity_model.dart';
import 'notification_model.dart';
import 'notification_repository.dart';

/// ViewModel managing state and operations for Notifications Inbox & Device Calendar Sync.
/// Complies with Tuần 3 (F20) - NOTI-01/02/03/04:
/// - Inbox displays unique notificationId
/// - Reminders with milestones (7d, 3d, 24h)
/// - Deduplicated eventId for device calendar
/// - Permission rejection NEVER reports success
class NotificationViewModel extends BaseViewModel {
  final NotificationRepository _repository;

  List<NotificationModel> _items = <NotificationModel>[];
  int _unreadCount = 0;
  String _selectedFilter = 'ALL'; // 'ALL' or 'UNREAD'
  final Map<String, CalendarSyncStatus> _syncStatusMap = <String, CalendarSyncStatus>{};

  // Flag to simulate/toggle permission refusal for verification
  bool _simulatePermissionDenied = false;
  String? _lastSyncMessage;
  bool _lastSyncIsSuccess = false;

  List<NotificationModel> get items {
    if (_selectedFilter == 'UNREAD') {
      return _items.where((NotificationModel n) => !n.isRead).toList();
    }
    return _items;
  }

  int get unreadCount => _unreadCount;
  String get selectedFilter => _selectedFilter;
  bool get simulatePermissionDenied => _simulatePermissionDenied;
  String? get lastSyncMessage => _lastSyncMessage;
  bool get lastSyncIsSuccess => _lastSyncIsSuccess;

  NotificationViewModel(this._repository);

  Future<void> loadNotifications() async {
    setLoading();

    final Result<List<NotificationModel>, Failure> result = await _repository.getNotifications();

    result.fold(
      onSuccess: (List<NotificationModel> data) {
        _items = data;
        _unreadCount = _items.where((NotificationModel n) => !n.isRead).length;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  void setFilter(String filter) {
    if (_selectedFilter != filter) {
      _selectedFilter = filter;
      notifyListeners();
    }
  }

  Future<void> markAsRead(String notificationId) async {
    await _repository.markAsRead(notificationId);
    final int index = _items.indexWhere((NotificationModel n) => n.notificationId == notificationId);
    if (index != -1) {
      _items[index] = _items[index].copyWith(isRead: true, readAt: DateTime.now());
      _unreadCount = _items.where((NotificationModel n) => !n.isRead).length;
      notifyListeners();
    }
  }

  Future<void> markAllAsRead() async {
    await _repository.markAllAsRead();
    _items = _items.map((NotificationModel n) => n.copyWith(isRead: true, readAt: DateTime.now())).toList();
    _unreadCount = 0;
    notifyListeners();
  }

  void togglePermissionSimulation(bool deny) {
    _simulatePermissionDenied = deny;
    notifyListeners();
  }

  CalendarSyncStatus getCalendarSyncStatus(String opportunityId) {
    return _syncStatusMap[opportunityId] ?? CalendarSyncStatus.notSynced;
  }

  /// Synchronize Opportunity Deadlines to Device Calendar
  ///
  /// CRITICAL RULE: "Từ chối quyền không báo thành công; eventId chống trùng"
  Future<bool> syncOpportunityToCalendar(
    OpportunityModel opportunity,
    List<ReminderMilestone> milestones,
  ) async {
    final Result<List<CalendarEventRecord>, Failure> result =
        await _repository.syncOpportunityToCalendar(
      opportunity: opportunity,
      milestones: milestones,
      simulatePermissionDenial: _simulatePermissionDenied,
    );

    return result.fold(
      onSuccess: (List<CalendarEventRecord> records) {
        _syncStatusMap[opportunity.id] = CalendarSyncStatus.synced;
        _lastSyncIsSuccess = true;
        _lastSyncMessage =
            'Đồng bộ thành công ${records.length} mốc nhắc vào lịch thiết bị! (Chống trùng eventId: ${records.first.eventId})';
        notifyListeners();
        return true;
      },
      onFailure: (Failure failure) {
        // PERMISSION DENIED: MUST NOT REPORT SUCCESS!
        _syncStatusMap[opportunity.id] = CalendarSyncStatus.permissionDenied;
        _lastSyncIsSuccess = false;
        _lastSyncMessage = failure.message;
        notifyListeners();
        return false;
      },
    );
  }
}

