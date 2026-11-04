import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../opportunity_model.dart';

/// Reusable Opportunity Card component shared across all views and team members (Tuần 1 & Tuần 2).
/// Displays type (Học bổng/Cuộc thi), applyMode (In-app/External), deadline countdown with explicit textual labels,
/// tags, bookmark action, and external mark status.
class OpportunityCard extends StatelessWidget {
  final OpportunityModel item;
  final VoidCallback? onTap;
  final VoidCallback? onBookmarkTap;

  const OpportunityCard({
    super.key,
    required this.item,
    this.onTap,
    this.onBookmarkTap,
  });

  @override
  Widget build(BuildContext context) {
    final DeadlineInfo deadline = item.deadlineInfo;

    return Card(
      elevation: 1.5,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: item.isBookmarked ? AppColors.primary.withOpacity(0.4) : AppColors.border,
          width: item.isBookmarked ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Top Bar: Type Badge + Apply Mode Badge + Bookmark Action
              Row(
                children: <Widget>[
                  // Type Badge (HỌC BỔNG vs CUỘC THI)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: item.isScholarship
                          ? AppColors.primary.withOpacity(0.12)
                          : AppColors.secondary.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: (item.isScholarship ? AppColors.primary : AppColors.secondary).withOpacity(0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(
                          item.isScholarship ? Icons.school_rounded : Icons.emoji_events_rounded,
                          size: 14,
                          color: item.isScholarship ? AppColors.primary : AppColors.secondary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          item.typeDisplay,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                            color: item.isScholarship ? AppColors.primary : AppColors.secondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),

                  // Apply Mode Badge (IN_APP vs EXTERNAL)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: item.isInApp
                          ? AppColors.success.withOpacity(0.1)
                          : Colors.purple.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      item.isInApp ? 'Nộp Online' : 'Nguồn Ngoài',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: item.isInApp ? AppColors.success : Colors.purple[800],
                      ),
                    ),
                  ),

                  const Spacer(),

                  // Bookmark Button (FR-OPP-06)
                  IconButton(
                    icon: Icon(
                      item.isBookmarked ? Icons.bookmark_rounded : Icons.bookmark_outline_rounded,
                      color: item.isBookmarked ? AppColors.primary : AppColors.textMuted,
                      size: 22,
                    ),
                    visualDensity: VisualDensity.compact,
                    tooltip: item.isBookmarked ? 'Bỏ lưu' : 'Lưu cơ hội',
                    onPressed: onBookmarkTap,
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Title (FR-OPP-01)
              Text(
                item.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 16.5,
                  fontWeight: FontWeight.bold,
                  height: 1.3,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),

              // Organizer Name
              Row(
                children: <Widget>[
                  const Icon(Icons.corporate_fare_rounded, size: 15, color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      item.organizerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Description snippet
              Text(
                item.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13.5,
                  color: AppColors.textSecondary,
                  height: 1.35,
                ),
              ),

              // Tags
              if (item.tags.isNotEmpty) ...<Widget>[
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: item.tags.map((String tag) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                      decoration: BoxDecoration(
                        color: AppColors.border.withOpacity(0.4),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '#$tag',
                        style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                      ),
                    );
                  }).toList(),
                ),
              ],

              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 10),

              // Deadline row with text + color status (FR-UX-02 & BR11)
              Row(
                children: <Widget>[
                  Icon(
                    deadline.isExpired
                        ? Icons.timer_off_outlined
                        : (deadline.isDueToday ? Icons.alarm_on_rounded : Icons.schedule_rounded),
                    size: 16,
                    color: _getDeadlineColor(deadline),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    deadline.statusText,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: _getDeadlineColor(deadline),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '(${deadline.formattedDate})',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5, color: AppColors.textMuted),
                    ),
                  ),
                  if (item.isExternalMarked)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.blue.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        'Đã nộp nguồn',
                        style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: Colors.blue),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getDeadlineColor(DeadlineInfo deadline) {
    if (deadline.isExpired) {
      return AppColors.error;
    }
    if (deadline.isDueToday) {
      return Colors.orange[800]!;
    }
    return AppColors.primary;
  }
}
