import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/constants/app_colors.dart';
import '../opportunity/opportunity_model.dart';
import 'notification_model.dart';
import 'notification_viewmodel.dart';

/// Modal Bottom Sheet for deadline reminders and the device calendar (F20, F29 - NOTI-02/03/04):
/// - In-app reminders (7/3/1 ngày) come from saving the opportunity; this sheet says so.
/// - The deadline is written to the device calendar as ONE event with an alarm per chosen
///   milestone; saving again updates that event (no duplicates), and the sheet warns when the
///   deadline changed since the last save.
/// - A refused calendar permission is shown as a failure, never as success.
class ReminderSettingsSheet extends StatefulWidget {
  final OpportunityModel opportunity;
  final NotificationViewModel viewModel;

  const ReminderSettingsSheet({
    super.key,
    required this.opportunity,
    required this.viewModel,
  });

  static Future<void> show(
    BuildContext context, {
    required OpportunityModel opportunity,
    required NotificationViewModel viewModel,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) => ReminderSettingsSheet(
        opportunity: opportunity,
        viewModel: viewModel,
      ),
    );
  }

  @override
  State<ReminderSettingsSheet> createState() => _ReminderSettingsSheetState();
}

class _ReminderSettingsSheetState extends State<ReminderSettingsSheet> {
  Set<ReminderMilestone> _selectedMilestones = <ReminderMilestone>{
    ReminderMilestone.sevenDays,
    ReminderMilestone.threeDays,
    ReminderMilestone.twentyFourHours,
  };
  bool _isSyncing = false;

  NotificationViewModel get _vm => widget.viewModel;
  OpportunityModel get _opp => widget.opportunity;

  @override
  void initState() {
    super.initState();
    _vm.clearSyncMessage();
    _vm.loadCalendarRecord(_opp.id).then((_) {
      final CalendarEventRecord? record = _vm.calendarRecordFor(_opp.id);
      if (!mounted || record == null || record.milestones.isEmpty) return;
      setState(() {
        _selectedMilestones = record.milestones
            .map(ReminderMilestone.fromCode)
            .whereType<ReminderMilestone>()
            .toSet();
      });
    });
  }

  Future<void> _save() async {
    setState(() => _isSyncing = true);
    await _vm.syncOpportunityToCalendar(_opp, _selectedMilestones.toList());
    if (mounted) setState(() => _isSyncing = false);
  }

  Future<void> _remove() async {
    setState(() => _isSyncing = true);
    await _vm.removeFromCalendar(_opp.id);
    if (mounted) setState(() => _isSyncing = false);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _vm,
      builder: (BuildContext context, Widget? _) => _buildSheet(context),
    );
  }

  Widget _buildSheet(BuildContext context) {
    final DateTime? deadline = _opp.registerDeadlineAt;
    final bool expired = deadline == null || !DateTime.now().isBefore(deadline);
    final CalendarEventRecord? record = _vm.calendarRecordFor(_opp.id);
    final bool synced = record?.syncStatus == CalendarSyncStatus.synced;
    final bool deadlineChanged = synced && deadline != null && !record!.deadline.isAtSameMomentAs(deadline);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Icon(Icons.alarm_add_rounded, color: AppColors.primary, size: 26),
                const SizedBox(width: 10),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: const Text(
                      'Nhắc hạn & Lịch thiết bị',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: 'Đóng',
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            Text(
              _opp.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),

            // In-app reminders (server, NOTI-02)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(
                    _opp.isBookmarked ? Icons.mark_email_unread_outlined : Icons.bookmark_add_outlined,
                    size: 20,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _opp.isBookmarked
                          ? 'Bạn đã lưu cơ hội này: Hộp thư sẽ nhắc trước hạn 7 ngày, 3 ngày và 1 ngày (không gửi trong 22:00–07:00).'
                          : 'Lưu cơ hội (biểu tượng bookmark) để nhận nhắc trong Hộp thư trước hạn 7 ngày, 3 ngày và 1 ngày.',
                      style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            const Divider(),

            const Text(
              'Lời nhắc trên lịch thiết bị (FR-NOTI-02):',
              style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            if (expired)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  'Cơ hội đã đóng đăng ký, không thể lập nhắc.',
                  style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w600),
                ),
              )
            else
              ...ReminderMilestone.values.map((ReminderMilestone milestone) {
                final DateTime due = deadline; // promoted: `expired` is false only when it is known
                final DateTime? alarm = milestone.plannedAlarm(due);
                final bool available = alarm != null;
                return CheckboxListTile(
                  key: Key('milestone_${milestone.code}'),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  enabled: available,
                  value: available && _selectedMilestones.contains(milestone),
                  title: Text(
                    milestone.label,
                    style: TextStyle(
                      fontSize: 14,
                      color: available ? AppColors.textPrimary : AppColors.textMuted,
                      decoration: available ? null : TextDecoration.lineThrough,
                    ),
                  ),
                  subtitle: Text(
                    available
                        ? 'Nhắc lúc ${DateFormat('HH:mm dd/MM').format(alarm)}'
                            '${isInQuietHours(milestone.calculateTriggerTime(due).toLocal()) ? ' (đã dời khỏi giờ yên lặng 22:00–07:00)' : ''}'
                        : 'Mốc này đã qua, hệ thống tự bỏ qua (FR-NOTI-02)',
                    style: TextStyle(
                      fontSize: 12,
                      color: available ? AppColors.textSecondary : AppColors.textMuted,
                    ),
                  ),
                  onChanged: available
                      ? (bool? val) => setState(() {
                            if (val == true) {
                              _selectedMilestones.add(milestone);
                            } else {
                              _selectedMilestones.remove(milestone);
                            }
                          })
                      : null,
                );
              }),

            if (synced && !deadlineChanged)
              _StatusLine(
                icon: Icons.event_available_rounded,
                color: AppColors.success,
                text: 'Đã có trong lịch thiết bị (lưu lúc ${DateFormat('HH:mm dd/MM/yyyy').format(record!.syncedAt)}).',
              ),
            if (deadlineChanged)
              const _StatusLine(
                key: Key('calendar_deadline_changed'),
                icon: Icons.update_rounded,
                color: AppColors.warning,
                text: 'Hạn chót đã thay đổi so với lần lưu trước. Nhấn "Cập nhật lịch" để sửa đúng sự kiện cũ.',
              ),

            const SizedBox(height: 12),

            // Result Feedback Banner (if any)
            if (_vm.lastSyncMessage != null)
              Container(
                key: const Key('calendar_sync_result'),
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: (_vm.lastSyncIsSuccess ? AppColors.success : AppColors.error).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _vm.lastSyncIsSuccess ? AppColors.success : AppColors.error),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Icon(
                      _vm.lastSyncIsSuccess ? Icons.check_circle_rounded : Icons.error_rounded,
                      color: _vm.lastSyncIsSuccess ? AppColors.success : AppColors.error,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          _vm.lastSyncMessage!,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            Wrap(
              spacing: 12,
              runSpacing: 8,
              alignment: WrapAlignment.end,
              children: <Widget>[
                if (synced || deadlineChanged)
                  TextButton.icon(
                    key: const Key('calendar_remove'),
                    onPressed: _isSyncing ? null : _remove,
                    icon: const Icon(Icons.event_busy_outlined),
                    label: const Text('Xóa khỏi lịch'),
                  ),
                OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Đóng'),
                ),
                ElevatedButton.icon(
                  key: const Key('calendar_save'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                  ),
                  icon: _isSyncing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Icon(Icons.event_rounded),
                  label: Text(_isSyncing
                      ? 'Đang lưu lịch...'
                      : (synced || deadlineChanged ? 'Cập nhật lịch' : 'Lưu vào Lịch thiết bị')),
                  onPressed: _isSyncing || expired ? null : _save,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;

  const _StatusLine({super.key, required this.icon, required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 12.5, color: AppColors.textPrimary))),
        ],
      ),
    );
  }
}
