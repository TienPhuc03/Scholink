import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../opportunity_model.dart';

/// Reusable Opportunity Card component shared across all views and team members (Tuần 1 & Tuần 2).
/// Displays type (Học bổng/Cuộc thi), applyMode (In-app/External), deadline countdown with explicit textual labels,
/// tags, bookmark action, and external mark status.
///
/// F29 (UX-03): badges and the deadline line wrap instead of overflowing at large font sizes.
/// TalkBack reads the card as one button with a full sentence; the bookmark is a second button.
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

  String _semanticLabel(DeadlineInfo deadline) {
    final String deadlineText = deadline.isExpired
        ? 'đã đóng đăng ký'
        : deadline.isDueToday
            ? 'hết hạn hôm nay lúc ${deadline.formattedDate.split(' ').last}'
            : 'còn ${deadline.remainingDays} ngày, hạn ${deadline.formattedDate}';
    return <String>[
      item.isScholarship ? 'Học bổng' : 'Cuộc thi',
      item.title,
      item.organizerName,
      item.isInApp ? 'nộp trực tuyến trên Scholink' : 'đăng ký tại website nguồn',
      deadlineText,
      if (item.isBookmarked) 'đã lưu',
      if (item.isExternalMarked) 'đã tự đánh dấu nộp tại nguồn',
    ].join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final DeadlineInfo deadline = item.deadlineInfo;

    return Card(
      elevation: 1.5,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: item.isBookmarked ? AppColors.primary.withValues(alpha: 0.4) : AppColors.border,
          width: item.isBookmarked ? 1.5 : 1,
        ),
      ),
      child: Stack(
        children: <Widget>[
          Semantics(
            button: onTap != null,
            label: _semanticLabel(deadline),
            onTap: onTap,
            excludeSemantics: true,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: _CardContent(item: item, deadline: deadline),
              ),
            ),
          ),
          // Bookmark Button (FR-OPP-06), 48dp touch target
          Positioned(
            top: 4,
            right: 4,
            child: IconButton(
              icon: Icon(
                item.isBookmarked ? Icons.bookmark_rounded : Icons.bookmark_outline_rounded,
                color: item.isBookmarked ? AppColors.primary : AppColors.textMuted,
                size: 22,
              ),
              tooltip: item.isBookmarked ? 'Bỏ lưu ${item.title}' : 'Lưu ${item.title}',
              onPressed: onBookmarkTap,
            ),
          ),
        ],
      ),
    );
  }
}

class _CardContent extends StatelessWidget {
  final OpportunityModel item;
  final DeadlineInfo deadline;

  const _CardContent({required this.item, required this.deadline});

  Color get _deadlineColor {
    if (deadline.isExpired) return AppColors.error;
    if (deadline.isDueToday) return Colors.orange[800]!;
    return AppColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    final Color typeColor = item.isScholarship ? AppColors.primary : AppColors.secondary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // Badges; the right gap keeps them clear of the bookmark button.
        Padding(
          padding: const EdgeInsets.only(right: 40),
          child: Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              // Type Badge (HỌC BỔNG vs CUỘC THI)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: typeColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: typeColor.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      item.isScholarship ? Icons.school_rounded : Icons.emoji_events_rounded,
                      size: 14,
                      color: typeColor,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      item.typeDisplay,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                        color: typeColor,
                      ),
                    ),
                  ],
                ),
              ),
              // Apply Mode Badge (IN_APP vs EXTERNAL)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: item.isInApp
                      ? AppColors.success.withValues(alpha: 0.1)
                      : Colors.purple.withValues(alpha: 0.1),
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
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Title (FR-OPP-01)
        Text(
          item.title,
          maxLines: 3,
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
                maxLines: 2,
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
            children: item.tags.take(6).map((String tag) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                decoration: BoxDecoration(
                  color: AppColors.border.withValues(alpha: 0.4),
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
        Wrap(
          spacing: 6,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            Icon(
              deadline.isExpired
                  ? Icons.timer_off_outlined
                  : (deadline.isDueToday ? Icons.alarm_on_rounded : Icons.schedule_rounded),
              size: 16,
              color: _deadlineColor,
            ),
            Text(
              deadline.statusText,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: _deadlineColor),
            ),
            Text(
              '(${deadline.formattedDate})',
              style: const TextStyle(fontSize: 11.5, color: AppColors.textMuted),
            ),
            if (item.isExternalMarked)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.12),
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
    );
  }
}
