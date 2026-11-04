import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../opportunity/opportunity_model.dart';
import 'notification_model.dart';
import 'notification_viewmodel.dart';

/// Modal Bottom Sheet for configuring deadline reminders and device calendar sync.
/// Fulfills Tuần 3 (F20) - NOTI-01/02/03/04:
/// - Milestone configuration (7 days, 3 days, 24 hours)
/// - Deduplicated eventId (`scholink_event_${oppId}_${milestone}`)
/// - CRITICAL RULE: "Từ chối quyền không báo thành công; eventId chống trùng"
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
  final Set<ReminderMilestone> _selectedMilestones = <ReminderMilestone>{
    ReminderMilestone.sevenDays,
    ReminderMilestone.twentyFourHours,
  };

  bool _isSyncing = false;

  @override
  Widget build(BuildContext context) {
    final DateTime? deadline = DateTime.tryParse(widget.opportunity.registerDeadline);
    final CalendarSyncStatus currentSyncStatus =
        widget.viewModel.getCalendarSyncStatus(widget.opportunity.id);

    return Padding(
      padding: EdgeInsets.only(
        left: 20.0,
        right: 20.0,
        top: 20.0,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24.0,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Header Row
          Row(
            children: <Widget>[
              const Icon(Icons.alarm_add_rounded, color: AppColors.primary, size: 26),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Thiết lập Nhắc hạn & Lịch thiết bị',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            widget.opportunity.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 8),

          // Milestone options
          const Text(
            'Chọn các mốc nhắc nhở (FR-NOTI-02):',
            style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),

          ...ReminderMilestone.values.map((ReminderMilestone milestone) {
            final bool isFuture = deadline != null && milestone.isFuture(deadline);
            final bool isChecked = _selectedMilestones.contains(milestone);

            return CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              enabled: isFuture,
              value: isFuture && isChecked,
              title: Text(
                milestone.label,
                style: TextStyle(
                  fontSize: 14,
                  color: isFuture ? AppColors.textPrimary : AppColors.textMuted,
                  decoration: isFuture ? null : TextDecoration.lineThrough,
                ),
              ),
              subtitle: Text(
                isFuture
                    ? 'Nhắc trước thời điểm đóng đăng ký'
                    : 'Mốc này đã qua thời gian, hệ thống tự động bỏ qua (FR-NOTI-02)',
                style: TextStyle(
                  fontSize: 12,
                  color: isFuture ? AppColors.textSecondary : AppColors.textMuted,
                ),
              ),
              onChanged: isFuture
                  ? (bool? val) {
                      setState(() {
                        if (val == true) {
                          _selectedMilestones.add(milestone);
                        } else {
                          _selectedMilestones.remove(milestone);
                        }
                      });
                    }
                  : null,
            );
          }),

          const SizedBox(height: 12),
          const Divider(),
          const SizedBox(height: 8),

          // Testing / QA Permission Denied Simulation Toggle
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Row(
              children: <Widget>[
                const Icon(Icons.security_update_warning_outlined, color: Colors.orange, size: 22),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        'Kiểm thử: Giả lập Từ chối Quyền Lịch',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        'Xác minh: Từ chối quyền KHÔNG báo thành công (FR-NOTI-04)',
                        style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: widget.viewModel.simulatePermissionDenied,
                  onChanged: (bool val) {
                    widget.viewModel.togglePermissionSimulation(val);
                    setState(() {});
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Result Feedback Banner (if any)
          if (widget.viewModel.lastSyncMessage != null)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: widget.viewModel.lastSyncIsSuccess
                    ? AppColors.success.withOpacity(0.12)
                    : AppColors.error.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: widget.viewModel.lastSyncIsSuccess ? AppColors.success : AppColors.error,
                ),
              ),
              child: Row(
                children: <Widget>[
                  Icon(
                    widget.viewModel.lastSyncIsSuccess ? Icons.check_circle_rounded : Icons.error_rounded,
                    color: widget.viewModel.lastSyncIsSuccess ? AppColors.success : AppColors.error,
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      widget.viewModel.lastSyncMessage!,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: widget.viewModel.lastSyncIsSuccess
                            ? Colors.green[900]
                            : Colors.red[900],
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Action Buttons
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Đóng'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  icon: _isSyncing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                        )
                      : const Icon(Icons.sync_rounded),
                  label: Text(_isSyncing ? 'Đang lưu lịch...' : 'Lưu vào Lịch thiết bị'),
                  onPressed: _isSyncing
                      ? null
                      : () async {
                          setState(() {
                            _isSyncing = true;
                          });

                          final bool ok = await widget.viewModel.syncOpportunityToCalendar(
                            widget.opportunity,
                            _selectedMilestones.toList(),
                          );

                          setState(() {
                            _isSyncing = false;
                          });

                          // Notice: If ok == false, UI displays the Error Banner above
                          // and DOES NOT report success!
                        },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

