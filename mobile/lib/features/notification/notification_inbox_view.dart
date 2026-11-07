import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/refresh_error_banner.dart';
import 'notification_model.dart';
import 'notification_viewmodel.dart';

/// Notification Inbox View (Tuần 3 - F20, Tuần 4/5 - F29/F38).
/// Fulfills FR-NOTI-01 & FR-UX-02:
/// - Displays each notificationId once, newest first
/// - Unread / All filtering, mark as read / mark all as read (queued while offline)
/// - Loading, empty, error and offline states; data on screen stays when a refresh fails
/// - Tapping a reminder / application update opens what it is about
class NotificationInboxView extends StatefulWidget {
  final NotificationViewModel viewModel;

  /// Opens the opportunity / application / team a notification points to.
  final void Function(NotificationModel notification)? onOpenTarget;

  /// Opens the channel & timezone settings (F29).
  final VoidCallback? onOpenSettings;

  const NotificationInboxView({
    super.key,
    required this.viewModel,
    this.onOpenTarget,
    this.onOpenSettings,
  });

  @override
  State<NotificationInboxView> createState() => _NotificationInboxViewState();
}

class _NotificationInboxViewState extends State<NotificationInboxView> {
  NotificationViewModel get _vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _vm.loadNotifications());
  }

  void _open(NotificationModel noti) {
    if (!noti.isRead) _vm.markAsRead(noti.notificationId);
    if (noti.hasTarget && widget.onOpenTarget != null) widget.onOpenTarget!(noti);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hộp thư thông báo'),
        actions: <Widget>[
          ListenableBuilder(
            listenable: _vm,
            builder: (BuildContext context, Widget? child) {
              if (_vm.unreadCount == 0) return const SizedBox.shrink();
              return IconButton(
                key: const Key('inbox_read_all'),
                onPressed: _vm.markAllAsRead,
                icon: const Icon(Icons.done_all_rounded),
                tooltip: 'Đánh dấu đã đọc tất cả',
              );
            },
          ),
          if (widget.onOpenSettings != null)
            IconButton(
              key: const Key('inbox_settings'),
              icon: const Icon(Icons.tune_rounded),
              tooltip: 'Cài đặt kênh nhận và múi giờ',
              onPressed: widget.onOpenSettings,
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Làm mới hộp thư',
            onPressed: _vm.loadNotifications,
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: _vm,
        builder: (BuildContext context, Widget? _) {
          return Column(
            children: <Widget>[
              // Filter Tabs: Tất cả vs Chưa đọc
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: <Widget>[
                    ChoiceChip(
                      selected: _vm.selectedFilter == 'ALL',
                      label: const Text('Tất cả'),
                      onSelected: (_) => _vm.setFilter('ALL'),
                    ),
                    ChoiceChip(
                      selected: _vm.selectedFilter == 'UNREAD',
                      label: Text(_vm.unreadCount > 0 ? 'Chưa đọc (${_vm.unreadCount})' : 'Chưa đọc'),
                      onSelected: (_) => _vm.setFilter('UNREAD'),
                    ),
                  ],
                ),
              ),
              if (_vm.isRefreshing) const LinearProgressIndicator(minHeight: 2),
              if (_vm.isShowingCache && _vm.items.isNotEmpty)
                Container(
                  key: const Key('inbox_cache_banner'),
                  width: double.infinity,
                  color: Colors.amber.shade100,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Text(
                    _vm.syncedAtText != null
                        ? 'Đang xem hộp thư lưu trên máy (cập nhật lúc ${_vm.syncedAtText}).'
                        : 'Đang xem hộp thư lưu trên máy.',
                    style: const TextStyle(fontSize: 12, color: Colors.brown, fontWeight: FontWeight.w500),
                  ),
                ),
              if (_vm.refreshError != null && _vm.items.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
                  child: RefreshErrorBanner(message: _vm.refreshError, onRetry: _vm.loadNotifications),
                ),
              if (_vm.pendingReads > 0)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: Text(
                    'Trạng thái "đã đọc" sẽ được đồng bộ khi có mạng.',
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ),
              const Divider(height: 1),
              Expanded(child: _buildBody()),
            ],
          );
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_vm.isLoading && _vm.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_vm.hasError && _vm.items.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          key: const Key('inbox_error_state'),
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              Text(_vm.errorMessage ?? 'Không thể tải thông báo', textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _vm.loadNotifications, child: const Text('Thử lại')),
            ],
          ),
        ),
      );
    }

    final List<NotificationModel> items = _vm.items;
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _vm.loadNotifications,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(24.0),
          children: <Widget>[
            const SizedBox(height: 40),
            const Icon(Icons.notifications_off_outlined, size: 54, color: AppColors.textMuted),
            const SizedBox(height: 12),
            const Text(
              'Hộp thư rỗng',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            Text(
              _vm.selectedFilter == 'UNREAD'
                  ? 'Bạn đã đọc toàn bộ thông báo!'
                  : 'Chưa có thông báo. Lưu một cơ hội để nhận nhắc hạn tại đây.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _vm.loadNotifications,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: items.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (BuildContext context, int index) {
          final NotificationModel noti = items[index];
          return _NotificationTile(
            key: ValueKey<String>('noti_${noti.notificationId}'),
            notification: noti,
            onTap: () => _open(noti),
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationModel notification;
  final VoidCallback onTap;

  const _NotificationTile({
    super.key,
    required this.notification,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final Color color = _getIconColor(notification.type);
    return Semantics(
      button: true,
      label: '${notification.isRead ? '' : 'Chưa đọc. '}${notification.typeDisplay}. '
          '${notification.title}. ${notification.body}. ${notification.formattedCreatedAt}',
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        child: Container(
          color: notification.isRead ? Colors.transparent : AppColors.primary.withValues(alpha: 0.04),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Icon according to type
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                child: Icon(_getIconData(notification.type), size: 20, color: color),
              ),
              const SizedBox(width: 12),

              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: <Widget>[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            notification.typeDisplay,
                            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: color),
                          ),
                        ),
                        Text(
                          notification.formattedCreatedAt,
                          style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      notification.title,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: notification.isRead ? FontWeight.w600 : FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      notification.body,
                      style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.35),
                    ),
                    if (notification.hasTarget)
                      const Padding(
                        padding: EdgeInsets.only(top: 6),
                        child: Text(
                          'Nhấn để xem chi tiết',
                          style: TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600),
                        ),
                      ),
                  ],
                ),
              ),

              // Unread blue dot indicator
              if (!notification.isRead) ...<Widget>[
                const SizedBox(width: 8),
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  IconData _getIconData(NotificationType type) {
    switch (type) {
      case NotificationType.deadlineReminder:
        return Icons.alarm_rounded;
      case NotificationType.applicationUpdate:
        return Icons.assignment_turned_in_rounded;
      case NotificationType.teamInvite:
        return Icons.group_add_rounded;
      case NotificationType.matchSuggestion:
        return Icons.auto_awesome_rounded;
      case NotificationType.system:
        return Icons.info_outline_rounded;
    }
  }

  Color _getIconColor(NotificationType type) {
    switch (type) {
      case NotificationType.deadlineReminder:
        return Colors.orange[800]!;
      case NotificationType.applicationUpdate:
        return AppColors.success;
      case NotificationType.teamInvite:
        return AppColors.primary;
      case NotificationType.matchSuggestion:
        return Colors.purple;
      case NotificationType.system:
        return Colors.blueGrey;
    }
  }
}
