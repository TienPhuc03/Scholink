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

  String _getBannerImageUrl() {
    final String titleLower = item.title.toLowerCase();
    if (titleLower.contains('ai') ||
        titleLower.contains('hackathon') ||
        titleLower.contains('công nghệ') ||
        item.isCompetition) {
      return 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80';
    } else if (titleLower.contains('nữ sinh') || titleLower.contains('stem')) {
      return 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80';
    } else if (titleLower.contains('tiếp bước') ||
        titleLower.contains('tài năng')) {
      return 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80';
    } else if (item.isScholarship) {
      return 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80';
    }
    return 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=800&q=80';
  }

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
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: item.isBookmarked
              ? AppColors.primary.withOpacity(0.4)
              : const Color(0xFFE5E7EB),
          width: item.isBookmarked ? 1.5 : 0.8,
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x05000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Semantics(
            label: semanticsText,
            container: true,
            child: Padding(
              padding: const EdgeInsets.all(14.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  // 1. Header: Monogram Avatar + Organizer Name + Verified + Bookmark Button
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF0FD),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFE2E8F0)),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          monogram,
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                            fontSize: 13.5,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Row(
                          children: <Widget>[
                            Flexible(
                              child: Text(
                                item.organizerName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.verified_rounded,
                              size: 14,
                              color: Color(0xFF0284C7),
                            ),
                          ],
                        ),
                      ),
                      // Bookmark Action with Accessible Tooltip (Touch target >= 44x44)
                      SizedBox(
                        width: 44,
                        height: 44,
                        child: IconButton(
                          tooltip: 'Lưu ${item.title}',
                          icon: Icon(
                            item.isBookmarked
                                ? Icons.bookmark_rounded
                                : Icons.bookmark_outline_rounded,
                            color: item.isBookmarked
                                ? AppColors.primary
                                : const Color(0xFF9CA3AF),
                            size: 22,
                          ),
                          onPressed: onBookmarkTap,
                        ),
                      ),
                    ],
                  ),

                  // 2. Metadata Badges (Type, Apply Mode, Deadline)
                  Wrap(
                    spacing: 6,
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
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF3F4F6),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          item.isExternal ? 'Website nguồn' : 'Nộp Online',
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF4B5563),
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: deadlineColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          deadlineText,
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: deadlineColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // 3. Post Title (SemiBold 16sp, maxLines 2)
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                      height: 1.3,
                    ),
                  ),

                  // 4. Brief Intro (Regular 13.5sp, maxLines 2)
                  if (item.description.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 4),
                    Text(
                      item.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w400,
                        color: AppColors.textSecondary,
                        height: 1.35,
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),

                  // 5. Visual Banner (Compact 16:6 ratio; if image fails, compact badge container without huge purple block)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Stack(
                      children: <Widget>[
                        AspectRatio(
                          aspectRatio: 16 / 6.2,
                          child: Image.network(
                            imageUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (BuildContext ctx, Object err,
                                StackTrace? stack) {
                              // Compact neutral fallback container, NOT a massive purple block
                              return Container(
                                color: const Color(0xFFF3F4F6),
                                alignment: Alignment.center,
                                child: const Icon(
                                  Icons.school_rounded,
                                  size: 28,
                                  color: Color(0xFF9CA3AF),
                                ),
                              );
                            },
                            loadingBuilder: (BuildContext ctx, Widget child,
                                ImageChunkEvent? loadingProgress) {
                              if (loadingProgress == null) return child;
                              return Container(
                                color: const Color(0xFFF9FAFB),
                                alignment: Alignment.center,
                                child: const SizedBox(
                                  width: 20,
                                  height: 20,
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
                            left: 8,
                            bottom: 8,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3.5),
                              decoration: BoxDecoration(
                                color: AppColors.success,
                                borderRadius: BorderRadius.circular(5),
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
                                  fontSize: 11,
                                ),
                              ),
                            ),
                          ),

                        // Bottom-Right Overlay: First Tag
                        if (item.tags.isNotEmpty)
                          Positioned(
                            right: 8,
                            bottom: 8,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 7, vertical: 3.5),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.6),
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(
                                item.tags.first.startsWith('#')
                                    ? item.tags.first
                                    : '#${item.tags.first}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 10.5,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),

                  // 6. Footer: Tags + CTA Pill Button
                  Padding(
                    padding: const EdgeInsets.only(top: 10.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: <Widget>[
                        // Up to 2 tags
                        Expanded(
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            children: <Widget>[
                              for (final String tag
                                  in item.tags.skip(1).take(2))
                                Text(
                                  tag.startsWith('#') ? tag : '#$tag',
                                  style: const TextStyle(
                                    fontSize: 11.5,
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
                          borderRadius: BorderRadius.circular(16),
                          child: InkWell(
                            onTap: onTap,
                            borderRadius: BorderRadius.circular(16),
                            child: const Padding(
                              padding: EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 7),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: <Widget>[
                                  Text(
                                    'Chi tiết',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                  SizedBox(width: 4),
                                  Icon(Icons.arrow_forward_rounded,
                                      size: 14, color: Colors.white),
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
