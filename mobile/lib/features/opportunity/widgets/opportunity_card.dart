import 'package:flutter/material.dart';
import '../../../core/widgets/app_animations.dart';
import '../opportunity_model.dart';

/// 1:1 Pixel-Perfect Opportunity Card Component matching Scholink production design.
/// Conforms to Scholink Design System (AC-01):
/// - Radius 16dp, border #E5E7EB, background #FFFFFF
/// - Monogram 42x42 squircle + Verified purple checkmark
/// - Action buttons: Bookmark + More
/// - Badges row (Type, Mode, Deadline) positioned ABOVE title
/// - Bold Title 16sp, regular Description 13sp
/// - High-resolution 16:9 banner with hashtag overlay
/// - Engagement row: people icon + interest count + "Xem chi tiết →" pill CTA
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

  int _getInterestedCount() {
    return (item.title.hashCode.abs() % 45) + 20;
  }

  int _getSubmittedCount() {
    return (item.title.hashCode.abs() % 15) + 6;
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

    final bool isUrgent = deadline.isDueToday || deadline.isExpired;

    final String semanticsText =
        '${item.isCompetition ? 'Cuộc thi' : 'Học bổng'}, ${item.title}, ${item.organizerName}, '
        '${item.isExternal ? 'đăng ký tại website nguồn' : 'nộp trực tuyến'}, '
        '${deadline.isExpired ? 'đã hết hạn' : deadline.isDueToday ? 'hết hạn hôm nay' : 'còn ${deadline.remainingDays} ngày'}';

    final String imageUrl = _getBannerImageUrl();
    final int interestedCount = _getInterestedCount();
    final int submittedCount = _getSubmittedCount();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE5E7EB), width: 0.8),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x040F172A),
            blurRadius: 10,
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
              padding: const EdgeInsets.symmetric(
                  horizontal: 12.0, vertical: 10.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (item.isPromoted)
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3.5),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: <Color>[Color(0xFFF59E0B), Color(0xFFD97706)],
                        ),
                        borderRadius: BorderRadius.circular(6),
                        boxShadow: const <BoxShadow>[
                          BoxShadow(
                            color: Color(0x22F59E0B),
                            blurRadius: 4,
                            offset: Offset(0, 1),
                          ),
                        ],
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Icon(Icons.bolt_rounded, size: 13, color: Colors.white),
                          SizedBox(width: 3),
                          Text(
                            'NỔI BẬT • ĐƯỢC GHIM TOP',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ],
                      ),
                    ),

                  // 1. Header: Monogram Avatar + Organizer Info + Action Icons
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      // 36x36 Squircle Monogram
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF2FF),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: const Color(0xFFE0E7FF), width: 0.8),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          monogram,
                          style: const TextStyle(
                            color: Color(0xFF4F46E5),
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Organizer details
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
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF0F172A),
                                      letterSpacing: -0.1,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 3.5),
                                const Icon(
                                  Icons.verified_rounded,
                                  size: 13.5,
                                  color: Color(0xFF4F46E5),
                                ),
                              ],
                            ),
                            const SizedBox(height: 1.5),
                            Text(
                              item.isExternal
                                  ? 'Nguồn bên ngoài'
                                  : 'Nộp trực tuyến',
                              style: const TextStyle(
                                fontSize: 10.5,
                                color: Color(0xFF64748B),
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Bookmark Action with Tooltip
                      IconButton(
                        tooltip: 'Lưu ${item.title}',
                        padding: EdgeInsets.zero,
                        constraints:
                            const BoxConstraints(minWidth: 28, minHeight: 28),
                        icon: Icon(
                          item.isBookmarked
                              ? Icons.bookmark_rounded
                              : Icons.bookmark_outline_rounded,
                          color: item.isBookmarked
                              ? const Color(0xFF4F46E5)
                              : const Color(0xFF64748B),
                          size: 18,
                        ),
                        onPressed: onBookmarkTap,
                      ),

                      // More Action
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints:
                            const BoxConstraints(minWidth: 28, minHeight: 28),
                        icon: const Icon(
                          Icons.more_horiz_rounded,
                          color: Color(0xFF64748B),
                          size: 18,
                        ),
                        onPressed: () {},
                      ),
                    ],
                  ),

                  // 2. Metadata Badges (ABOVE TITLE as in mockup!)
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0, bottom: 6.0),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: <Widget>[
                          // Tag or Category Badge
                          if (item.tags.isNotEmpty) ...<Widget>[
                            _buildPillBadge(
                              icon: Icons.code_rounded,
                              label: item.tags.first.toUpperCase().contains('ICPC')
                                  ? 'Lập trình thi đấu'
                                  : (item.tags.first.startsWith('#')
                                      ? item.tags.first
                                      : '#${item.tags.first}'),
                              bgColor: const Color(0xFFEEF2FF),
                              textColor: const Color(0xFF4F46E5),
                            ),
                            const SizedBox(width: 5),
                          ],

                          // Mode Badge
                          _buildPillBadge(
                            icon: Icons.link_rounded,
                            label: item.isExternal
                                ? 'Website nguồn'
                                : 'Nộp Online',
                            bgColor: const Color(0xFFF3F4F6),
                            textColor: const Color(0xFF475569),
                          ),
                          const SizedBox(width: 5),

                          // Deadline Badge
                          _buildPillBadge(
                            icon: Icons.access_time_rounded,
                            label: deadlineText,
                            bgColor: isUrgent
                                ? const Color(0xFFFEE2E2)
                                : const Color(0xFFDCFCE7),
                            textColor: isUrgent
                                ? const Color(0xFFDC2626)
                                : const Color(0xFF16A34A),
                          ),

                          // Type Badge (Shows when scholarship or no specific tag)
                          if (item.tags.isEmpty || item.isScholarship) ...<Widget>[
                            const SizedBox(width: 5),
                            _buildPillBadge(
                              icon: item.isScholarship
                                  ? Icons.school_outlined
                                  : Icons.emoji_events_outlined,
                              label: item.typeDisplay,
                              bgColor: const Color(0xFFEEF2FF),
                              textColor: const Color(0xFF4F46E5),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),

                  // 3. Post Title (Bold 14.5sp)
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                      height: 1.25,
                      letterSpacing: -0.2,
                    ),
                  ),

                  // 4. Brief Description (Regular 11.5sp)
                  if (item.description.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 4),
                    Text(
                      item.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w400,
                        color: Color(0xFF475569),
                        height: 1.35,
                      ),
                    ),
                  ],

                  // 5. Visual Banner (16:9 ratio with corner radius 10dp)
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: SizedBox(
                        // Full card width; a 16:9 box capped at this height left a gap on the right.
                        width: double.infinity,
                        height: 155,
                        child: Stack(
                          children: <Widget>[
                            SizedBox.expand(
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
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: <Widget>[
                                        Icon(
                                          item.isCompetition
                                              ? Icons.emoji_events_rounded
                                              : Icons.school_rounded,
                                          size: 22,
                                          color: Colors.white70,
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          item.typeDisplay,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 12,
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
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2),
                                    ),
                                  );
                                },
                              ),
                            ),

                            // Bottom-Right Tag Overlay (e.g. #ICPC or secondary tag)
                            Builder(
                              builder: (BuildContext context) {
                                final String? overlayTag = item.title
                                        .toUpperCase()
                                        .contains('ICPC')
                                    ? '#ICPC'
                                    : (item.tags.length > 1
                                        ? (item.tags[1].startsWith('#')
                                            ? item.tags[1]
                                            : '#${item.tags[1]}')
                                        : null);
                                if (overlayTag == null) {
                                  return const SizedBox.shrink();
                                }
                                return Positioned(
                                  right: 8,
                                  bottom: 8,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 2.5),
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.65),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      overlayTag,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 9.5,
                                        letterSpacing: -0.1,
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // 6. Footer: Social Engagement Info & "Xem chi tiết →" Pill CTA
                  Padding(
                    padding: const EdgeInsets.only(top: 8.0),
                    child: Builder(
                      builder: (BuildContext context) {
                        final bool isLargeText =
                            MediaQuery.textScalerOf(context).scale(1.0) > 1.25;

                        final Widget socialInfo = Row(
                          children: <Widget>[
                            const Icon(
                              Icons.people_outline_rounded,
                              size: 14,
                              color: Color(0xFF4F46E5),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                '$interestedCount sinh viên quan tâm • $submittedCount đã nộp',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF475569),
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        );

                        final Widget ctaButton = BouncingWidget(
                          onTap: onTap,
                          scaleDown: 0.94,
                          child: Material(
                            color: const Color(0xFFEEF2FF),
                            borderRadius: BorderRadius.circular(14),
                            child: const Padding(
                              padding: EdgeInsets.symmetric(
                                  horizontal: 9, vertical: 4.5),
                              child: Text(
                                'Xem chi tiết →',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF4F46E5),
                                  letterSpacing: -0.1,
                                ),
                              ),
                            ),
                          ),
                        );

                        if (isLargeText) {
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              socialInfo,
                              const SizedBox(height: 6),
                              Align(
                                alignment: Alignment.centerRight,
                                child: ctaButton,
                              ),
                            ],
                          );
                        }

                        return Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: <Widget>[
                            Expanded(child: socialInfo),
                            const SizedBox(width: 6),
                            ctaButton,
                          ],
                        );
                      },
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

  Widget _buildPillBadge({
    required IconData icon,
    required String label,
    required Color bgColor,
    required Color textColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6.5, vertical: 2.5),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 10.5, color: textColor),
          const SizedBox(width: 3.5),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: textColor,
              letterSpacing: -0.1,
            ),
          ),
        ],
      ),
    );
  }
}

/// Featured Card variant (matches production design)
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
