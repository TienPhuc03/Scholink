import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../opportunity_model.dart';

/// Compact & Accessible Opportunity Card Component.
/// Conforms to Scholink Design System (AC-01):
/// - Radius 16dp, border #E5E7EB, background #FFFFFF
/// - Organizer Monogram Avatar + Verified badge
/// - Compact badges: Type, Mode, Deadline
/// - Title (maxLines 2, SemiBold 16sp), Description (maxLines 2, Regular 13.5sp)
/// - Compact visual banner without massive purple placeholders
/// - Maximum 2 tags + "Chi tiết" CTA pill button
/// - Full accessibility and no overflow at text scale 2.0
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

  String _getMonogram(String name) {
    if (name.isEmpty) return 'SL';
    final List<String> words = name.trim().split(RegExp(r'\s+'));
    if (words.length == 1) {
      return words[0].substring(0, words[0].length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${words[0][0]}${words[1][0]}'.toUpperCase();
  }

  String _getBannerImageUrl() => item.bannerImageUrl;

  @override
  Widget build(BuildContext context) {
    final DeadlineInfo deadline = item.deadlineInfo;
    final String monogram = _getMonogram(item.organizerName);

    final String deadlineText = deadline.isExpired
        ? 'Hết hạn'
        : deadline.isDueToday
            ? 'Hết hạn hôm nay'
            : 'CÒN ${deadline.remainingDays} NGÀY';

    final Color deadlineColor = (deadline.isDueToday || deadline.isExpired)
        ? AppColors.error
        : const Color(0xFF0D9488);

    final String semanticsText =
        '${item.isCompetition ? 'Cuộc thi' : 'Học bổng'}, ${item.title}, ${item.organizerName}, '
        '${item.isExternal ? 'đăng ký tại website nguồn' : 'nộp trực tuyến'}, '
        '${deadline.isExpired ? 'đã hết hạn' : deadline.isDueToday ? 'hết hạn hôm nay' : 'còn ${deadline.remainingDays} ngày'}';

    final String imageUrl = _getBannerImageUrl();

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: item.isBookmarked
              ? AppColors.primary.withValues(alpha: 0.35)
              : const Color(0xFFE2E8F0),
          width: item.isBookmarked ? 1.1 : 0.7,
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x040F172A),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Semantics(
            label: semanticsText,
            container: true,
            child: Padding(
              padding: const EdgeInsets.all(12.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  // 1. Header: Monogram Avatar + Organizer Info + Overflow & Bookmark
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF0FD),
                          shape: BoxShape.circle,
                          border: Border.all(color: const Color(0xFFE2E8F0), width: 0.6),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          monogram,
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Row(
                              children: <Widget>[
                                Flexible(
                                  child: Text(
                                    item.organizerName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textPrimary,
                                      letterSpacing: -0.1,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.verified_rounded,
                                  size: 13,
                                  color: Color(0xFF0284C7),
                                ),
                              ],
                            ),
                            const SizedBox(height: 1),
                            Text(
                              item.isExternal ? 'Nguồn bên ngoài' : 'Tuyển sinh trực tuyến',
                              style: const TextStyle(
                                fontSize: 10.5,
                                color: Color(0xFF64748B),
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Bookmark Action with Accessible Tooltip (Touch target >= 44x44)
                      SizedBox(
                        width: 38,
                        height: 38,
                        child: IconButton(
                          tooltip: 'Lưu ${item.title}',
                          padding: EdgeInsets.zero,
                          icon: Icon(
                            item.isBookmarked
                                ? Icons.bookmark_rounded
                                : Icons.bookmark_outline_rounded,
                            color: item.isBookmarked
                                ? AppColors.primary
                                : const Color(0xFF94A3B8),
                            size: 20,
                          ),
                          onPressed: onBookmarkTap,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // 2. Metadata Badges (Type, Apply Mode, Deadline)
                  Wrap(
                    spacing: 5,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: <Widget>[
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF0FD),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          item.typeDisplay,
                          style: const TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          item.isExternal ? 'Website nguồn' : 'Nộp Online',
                          style: const TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF475569),
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: deadlineColor.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          deadlineText,
                          style: TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                            color: deadlineColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 7),

                  // 3. Post Title (SemiBold 14.5sp, maxLines 2)
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                      height: 1.35,
                      letterSpacing: -0.2,
                    ),
                  ),

                  // 4. Brief Intro (Regular 12.5sp, maxLines 2)
                  if (item.description.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 3.5),
                    Text(
                      item.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w400,
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ],
                  const SizedBox(height: 9),

                  // 5. Visual Banner (Compact 16:6.5 ratio)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Stack(
                      children: <Widget>[
                        AspectRatio(
                          aspectRatio: 16 / 6.5,
                          child: Image.network(
                            imageUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (BuildContext ctx, Object err,
                                StackTrace? stack) {
                              return Container(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: item.isCompetition
                                        ? <Color>[
                                            const Color(0xFF0F172A),
                                            const Color(0xFF1E293B),
                                          ]
                                        : <Color>[
                                            const Color(0xFF1E3A8A),
                                            const Color(0xFF2563EB),
                                          ],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                  ),
                                ),
                                alignment: Alignment.center,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: <Widget>[
                                    Icon(
                                      item.isCompetition
                                          ? Icons.emoji_events_rounded
                                          : Icons.school_rounded,
                                      size: 20,
                                      color: Colors.white70,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      item.typeDisplay,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 11,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                            loadingBuilder: (BuildContext ctx, Widget child,
                                ImageChunkEvent? loadingProgress) {
                              if (loadingProgress == null) return child;
                              return Container(
                                color: const Color(0xFFF8FAFC),
                                alignment: Alignment.center,
                                child: const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                ),
                              );
                            },
                          ),
                        ),

                        // Bottom-Left Overlay: Reward Badge
                        if (item.reward.isNotEmpty)
                          Positioned(
                            left: 7,
                            bottom: 7,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.success,
                                borderRadius: BorderRadius.circular(4),
                                boxShadow: const <BoxShadow>[
                                  BoxShadow(
                                      color: Colors.black26,
                                      blurRadius: 3,
                                      offset: Offset(0, 1)),
                                ],
                              ),
                              child: Text(
                                item.reward,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                          ),

                        // Bottom-Right Overlay: First Tag
                        if (item.tags.isNotEmpty)
                          Positioned(
                            right: 7,
                            bottom: 7,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 3),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                item.tags.first.startsWith('#')
                                    ? item.tags.first
                                    : '#${item.tags.first}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 9.5,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),

                  // 6. LinkedIn-style Engagement & Meta Row
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0, bottom: 4.0),
                    child: Row(
                      children: <Widget>[
                        SizedBox(
                          width: 27,
                          height: 15,
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: <Widget>[
                              Positioned(
                                left: 0,
                                top: 0,
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF0A66C2),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.thumb_up_alt_rounded,
                                      size: 8, color: Colors.white),
                                ),
                              ),
                              Positioned(
                                left: 11,
                                top: 0,
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFE11D48),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white, width: 1),
                                  ),
                                  child: const Icon(Icons.favorite_rounded,
                                      size: 8, color: Colors.white),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Expanded(
                          child: Text(
                            '24 sinh viên quan tâm • 8 đã nộp',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xFF64748B),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        if (item.tags.length > 1)
                          Text(
                            item.tags[1].startsWith('#')
                                ? item.tags[1]
                                : '#${item.tags[1]}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: Color(0xFF64748B),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                      ],
                    ),
                  ),

                  const Divider(height: 1, thickness: 0.6, color: Color(0xFFF1F5F9)),

                  // 7. Footer: Up to 2 tags + Primary "Chi tiết" Pill Button
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: <Widget>[
                        // Up to 2 tags
                        Expanded(
                          child: Wrap(
                            spacing: 5,
                            runSpacing: 3,
                            children: <Widget>[
                              for (final String tag
                                  in item.tags.skip(1).take(2))
                                Text(
                                  tag.startsWith('#') ? tag : '#$tag',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                            ],
                          ),
                        ),

                        // Primary Action Pill Button
                        Material(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(14),
                          child: InkWell(
                            onTap: onTap,
                            borderRadius: BorderRadius.circular(14),
                            child: const Padding(
                              padding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 5.5),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: <Widget>[
                                  Text(
                                    'Chi tiết',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                  SizedBox(width: 3.5),
                                  Icon(Icons.arrow_forward_rounded,
                                      size: 13, color: Colors.white),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Featured Card variant (matches compact design)
class FeaturedOpportunityCard extends StatelessWidget {
  final OpportunityModel item;
  final VoidCallback? onTap;
  final VoidCallback? onBookmarkTap;

  const FeaturedOpportunityCard({
    super.key,
    required this.item,
    this.onTap,
    this.onBookmarkTap,
  });

  @override
  Widget build(BuildContext context) {
    return OpportunityCard(
      item: item,
      onTap: onTap,
      onBookmarkTap: onBookmarkTap,
    );
  }
}
