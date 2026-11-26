import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/refresh_error_banner.dart';
import '../../core/widgets/skeleton_loader.dart';
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

  /// Navigates to opportunity explorer when inbox is empty (AC-04).
  final VoidCallback? onExploreOpportunities;

  const NotificationInboxView({
    super.key,
    required this.viewModel,
    this.onOpenTarget,
    this.onOpenSettings,
    this.onExploreOpportunities,
  });

  @override
  State<NotificationInboxView> createState() => _NotificationInboxViewState();
}

class _NotificationInboxViewState extends State<NotificationInboxView> {
  NotificationViewModel get _vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _vm.loadNotifications());
  }

  void _open(NotificationModel noti) {
    if (!noti.isRead) _vm.markAsRead(noti.notificationId);
    if (noti.hasTarget && widget.onOpenTarget != null) {
      widget.onOpenTarget!(noti);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Hộp thư thông báo',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.4,
            color: Color(0xFF0F172A),
          ),
        ),
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
              // LinkedIn-style Filter Chips Row (Horizontally scrollable)
              Container(
                color: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: <Widget>[
                      _buildPillChip(
                        label: 'Tất cả',
                        selected: _vm.selectedFilter == 'ALL',
                        onTap: () => _vm.setFilter('ALL'),
                      ),
                      const SizedBox(width: 8),
                      _buildPillChip(
                        label: _vm.unreadCount > 0
                            ? 'Chưa đọc (${_vm.unreadCount})'
                            : 'Chưa đọc',
                        selected: _vm.selectedFilter == 'UNREAD',
                        onTap: () => _vm.setFilter('UNREAD'),
                      ),
                    ],
                  ),
                ),
              ),
              if (_vm.isRefreshing) const LinearProgressIndicator(minHeight: 2),
              if (_vm.isShowingCache && _vm.items.isNotEmpty)
                Container(
                  key: const Key('inbox_cache_banner'),
                  width: double.infinity,
                  color: Colors.amber.shade100,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Text(
                    _vm.syncedAtText != null
                        ? 'Đang xem hộp thư lưu trên máy (cập nhật lúc ${_vm.syncedAtText}).'
                        : 'Đang xem hộp thư lưu trên máy.',
                    style: const TextStyle(
                        fontSize: 12,
                        color: Colors.brown,
                        fontWeight: FontWeight.w500),
                  ),
                ),
              if (_vm.refreshError != null && _vm.items.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
                  child: RefreshErrorBanner(
                      message: _vm.refreshError,
                      onRetry: _vm.loadNotifications),
                ),
              if (_vm.pendingReads > 0)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: Text(
                    'Trạng thái "đã đọc" sẽ được đồng bộ khi có mạng.',
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ),
              const Divider(height: 1, thickness: 0.6, color: Color(0xFFE2E8F0)),
              Expanded(child: _buildBody()),
            ],
          );
        },
      ),
    );
  }

  Widget _buildPillChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF4F46E5) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? const Color(0xFF4F46E5) : const Color(0xFFE2E8F0),
            width: 0.8,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            color: selected ? Colors.white : const Color(0xFF1F2937),
            letterSpacing: -0.1,
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_vm.isLoading && _vm.items.isEmpty) {
      return const NotificationListSkeleton(count: 6);
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
              Text(_vm.errorMessage ?? 'Không thể tải thông báo',
                  textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(
                  onPressed: _vm.loadNotifications,
                  child: const Text('Thử lại')),
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
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
          children: <Widget>[
            const SizedBox(height: 32),
            AppEmptyState(
              icon: Icons.notifications_none_rounded,
              title: _vm.selectedFilter == 'UNREAD'
                  ? 'Không có thông báo chưa đọc'
                  : 'Hộp thư rỗng',
              message: _vm.selectedFilter == 'UNREAD'
                  ? 'Bạn đã đọc toàn bộ thông báo!'
                  : 'Chưa có thông báo nào. Cập nhật về cơ hội, đội thi và tin nhắn sẽ xuất hiện tại đây.',
              action: widget.onExploreOpportunities != null
                  ? ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 18, vertical: 11),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: widget.onExploreOpportunities,
                      icon: const Icon(Icons.explore_outlined, size: 18),
                      label: const Text('Khám phá cơ hội',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                    )
                  : null,
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
        separatorBuilder: (_, __) =>
            const Divider(height: 1, thickness: 0.6, color: Color(0xFFF1F5F9)),
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

  String _cleanNotificationBody(String raw) {
    if (raw.startsWith('[image]') || raw.startsWith('data:image')) {
      return '📷 [Hình ảnh]';
    }
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    final Color color = _getIconColor(notification.type);
    final String cleanBody = _cleanNotificationBody(notification.body);
    return Semantics(
      button: true,
      label:
          '${notification.isRead ? '' : 'Chưa đọc. '}${notification.typeDisplay}. '
          '${notification.title}. $cleanBody. ${notification.formattedCreatedAt}',
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        child: Container(
          color: notification.isRead
              ? Colors.transparent
              : AppColors.primary.withValues(alpha: 0.035),
          padding: const EdgeInsets.fromLTRB(10, 12, 14, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Unread blue indicator dot (LinkedIn pattern: far left)
              Container(
                margin: const EdgeInsets.only(top: 14, right: 6),
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: notification.isRead
                      ? Colors.transparent
                      : const Color(0xFF0A66C2),
                  shape: BoxShape.circle,
                ),
              ),

              // Organization / Category Icon
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Icon(_getIconData(notification.type),
                    size: 19, color: color),
              ),
              const SizedBox(width: 10),

              // Content & Typography
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Wrap(
                      spacing: 6,
                      runSpacing: 3,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: <Widget>[
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            notification.typeDisplay,
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: color,
                            ),
                          ),
                        ),
                        Text(
                          notification.formattedCreatedAt,
                          style: const TextStyle(
                            fontSize: 10.5,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      notification.title,
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: notification.isRead
                            ? FontWeight.w600
                            : FontWeight.w700,
                        color: AppColors.textPrimary,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      cleanBody,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF475569),
                        height: 1.35,
                      ),
                    ),
                    if (notification.hasTarget)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 3.5),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEFF6FF),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                                color: const Color(0xFFBFDBFE), width: 0.6),
                          ),
                          child: const Text(
                            'Xem chi tiết →',
                            style: TextStyle(
                              fontSize: 10.5,
                              color: Color(0xFF1D4ED8),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // Trailing overflow dots
              const Padding(
                padding: EdgeInsets.only(top: 4, left: 4),
                child: Icon(
                  Icons.more_horiz_rounded,
                  size: 16,
                  color: Color(0xFF94A3B8),
                ),
              ),
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
