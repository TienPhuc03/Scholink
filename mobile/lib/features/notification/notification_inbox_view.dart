import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'notification_model.dart';
import 'notification_viewmodel.dart';

/// Notification Inbox View (Tuần 3 - F20).
/// Fulfills FR-NOTI-01 & FR-UX-02:
/// - Displays notifications with unique notificationId
/// - Unread / All filtering
/// - Mark as read / Mark all as read
/// - Clear loading, empty, and error states
class NotificationInboxView extends StatefulWidget {
  final NotificationViewModel viewModel;

  const NotificationInboxView({
    super.key,
    required this.viewModel,
  });

  @override
  State<NotificationInboxView> createState() => _NotificationInboxViewState();
}

class _NotificationInboxViewState extends State<NotificationInboxView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.viewModel.loadNotifications();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hộp thư thông báo'),
        actions: <Widget>[
          ListenableBuilder(
            listenable: widget.viewModel,
            builder: (BuildContext context, Widget? child) {
              if (widget.viewModel.unreadCount > 0) {
                return TextButton.icon(
                  onPressed: () => widget.viewModel.markAllAsRead(),
                  icon: const Icon(Icons.done_all_rounded, size: 18),
                  label: const Text('Đọc tất cả'),
                );
              }
              return const SizedBox.shrink();
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => widget.viewModel.loadNotifications(),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          // Filter Tabs: Tất cả vs Chưa đọc
          ListenableBuilder(
            listenable: widget.viewModel,
            builder: (BuildContext context, Widget? child) {
              final String currentFilter = widget.viewModel.selectedFilter;
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: Row(
                  children: <Widget>[
                    ChoiceChip(
                      selected: currentFilter == 'ALL',
                      label: const Text('Tất cả'),
                      onSelected: (_) => widget.viewModel.setFilter('ALL'),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      selected: currentFilter == 'UNREAD',
                      label: Text(
                        widget.viewModel.unreadCount > 0
                            ? 'Chưa đọc (${widget.viewModel.unreadCount})'
                            : 'Chưa đọc',
                      ),
                      onSelected: (_) => widget.viewModel.setFilter('UNREAD'),
                    ),
                  ],
                ),
              );
            },
          ),
          const Divider(height: 1),

          // Main Inbox Content
          Expanded(
            child: ListenableBuilder(
              listenable: widget.viewModel,
              builder: (BuildContext context, Widget? child) {
                if (widget.viewModel.isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (widget.viewModel.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          const Icon(Icons.error_outline, size: 48, color: AppColors.error),
                          const SizedBox(height: 12),
                          Text(
                            widget.viewModel.errorMessage ?? 'Không thể tải thông báo',
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: () => widget.viewModel.loadNotifications(),
                            child: const Text('Thử lại'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                final List<NotificationModel> items = widget.viewModel.items;
                if (items.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          const Icon(Icons.notifications_off_outlined, size: 54, color: AppColors.textMuted),
                          const SizedBox(height: 12),
                          const Text(
                            'Hộp thư rỗng',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            widget.viewModel.selectedFilter == 'UNREAD'
                                ? 'Bạn đã đọc toàn bộ thông báo!'
                                : 'Bạn chưa có thông báo mới nào.',
                            style: const TextStyle(color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () => widget.viewModel.loadNotifications(),
                  child: ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (BuildContext context, int index) {
                      final NotificationModel noti = items[index];
                      return _NotificationTile(
                        notification: noti,
                        onTap: () {
                          if (!noti.isRead) {
                            widget.viewModel.markAsRead(noti.notificationId);
                          }
                        },
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationModel notification;
  final VoidCallback onTap;

  const _NotificationTile({
    required this.notification,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        color: notification.isRead ? Colors.transparent : AppColors.primary.withOpacity(0.04),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Icon according to type
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: _getIconBackgroundColor(notification.type),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _getIconData(notification.type),
                size: 20,
                color: _getIconColor(notification.type),
              ),
            ),
            const SizedBox(width: 12),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  // Category label & Unique notificationId
                  Row(
                    children: <Widget>[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: _getIconBackgroundColor(notification.type),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          notification.typeDisplay,
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.bold,
                            color: _getIconColor(notification.type),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      // FR-NOTI-01: Displays unique notificationId
                      Text(
                        '#${notification.notificationId}',
                        style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                      ),
                      const Spacer(),
                      Text(
                        notification.formattedCreatedAt,
                        style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),

                  // Title
                  Text(
                    notification.title,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: notification.isRead ? FontWeight.w600 : FontWeight.bold,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),

                  // Body
                  Text(
                    notification.body,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                      height: 1.35,
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
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ],
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

  Color _getIconBackgroundColor(NotificationType type) {
    return _getIconColor(type).withOpacity(0.12);
  }
}

