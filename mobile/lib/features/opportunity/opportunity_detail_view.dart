import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/constants/app_colors.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/widgets/refresh_error_banner.dart';
import 'opportunity_model.dart';
import 'opportunity_repository.dart';
import 'opportunity_viewmodel.dart';

/// Opens [uri] outside the app. Replaced in widget tests.
typedef ExternalLinkOpener = Future<bool> Function(Uri uri);

Future<bool> openInExternalBrowser(Uri uri) =>
    launchUrl(uri, mode: LaunchMode.externalApplication);

/// Detailed view for Opportunity (FR-OPP-04, FR-OPP-06, FR-APP-04, BR10, BR11).
/// Pixel-perfect 1:1 redesign matching Scholink Design System:
/// - AppBar with back arrow, title "Chi tiết Cuộc thi" / "Chi tiết Học bổng", bookmark & share actions
/// - Dark purple Hero banner card with badge, title, organizer, and background photo
/// - Quick stats strip (3 columns: Hạn đăng ký, Hình thức, Phạm vi)
/// - Primary full-width purple CTA: "Đăng ký tại website nguồn"
/// - Accent section headers: "| Giới thiệu" and "| Thông tin chính"
/// - Structured key-value card with clean icons & rows
/// - External source link card: "🔗 Nguồn công bố ... icpc.global ↗"
/// - Secondary outlined purple button: "☑ Tự đánh dấu đã nộp"
class OpportunityDetailView extends StatefulWidget {
  final OpportunityModel opportunity;
  final OpportunityViewModel viewModel;
  final bool isGuest;
  final VoidCallback? onOpenReminderSettings;

  /// F19 (TV1): starts the real IN_APP application flow (it also handles guests: AUTH-05).
  final VoidCallback? onApplyInApp;

  /// Guests tapping bookmark / "đã nộp tại nguồn" are sent to log in (F10: the bookmark continues).
  final void Function(OpportunityModel opportunity)? onBookmarkNeedsLogin;

  final ExternalLinkOpener openLink;

  const OpportunityDetailView({
    super.key,
    required this.opportunity,
    required this.viewModel,
    this.isGuest = false,
    this.onOpenReminderSettings,
    this.onApplyInApp,
    this.onBookmarkNeedsLogin,
    this.openLink = openInExternalBrowser,
  });

  @override
  State<OpportunityDetailView> createState() => _OpportunityDetailViewState();
}

class _OpportunityDetailViewState extends State<OpportunityDetailView> {
  late OpportunityModel _opp = widget.opportunity;
  bool _refreshing = true;
  bool _fromCache = false;
  String? _refreshError;
  bool _busyMark = false;

  OpportunityViewModel get _vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    _vm.addListener(_syncFromViewModel);
    _refresh();
  }

  @override
  void dispose() {
    _vm.removeListener(_syncFromViewModel);
    super.dispose();
  }

  /// Bookmark / external mark changed in the shared view model (here or in the list).
  void _syncFromViewModel() {
    final OpportunityModel? latest = _vm.findById(_opp.id);
    if (latest != null && mounted) setState(() => _opp = latest);
  }

  Future<void> _refresh() async {
    setState(() {
      _refreshing = true;
      _refreshError = null;
    });
    final Result<OpportunityDetail, Failure> res =
        await _vm.refreshDetail(_opp.id);
    if (!mounted) return;
    setState(() {
      _refreshing = false;
      res.fold(
        onSuccess: (OpportunityDetail d) {
          _opp = d.item;
          _fromCache = d.fromCache;
          _refreshError = d.refreshFailure?.message;
        },
        onFailure: (Failure f) {
          _fromCache = true;
          _refreshError = f.message;
        },
      );
    });
  }

  void _snack(String message, {Color? color}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
          content: Text(message),
          backgroundColor: color,
          duration: const Duration(seconds: 3)));
  }

  Future<void> _toggleBookmark() async {
    if (widget.isGuest) {
      if (widget.onBookmarkNeedsLogin != null) {
        widget.onBookmarkNeedsLogin!(_opp);
      } else {
        _snack('Đăng nhập để lưu cơ hội và nhận nhắc hạn.');
      }
      return;
    }
    final bool willSave = !_opp.isBookmarked;
    final Failure? failure = await _vm.toggleBookmark(_opp);
    if (!mounted) return;
    if (failure != null) {
      _snack('Chưa lưu được thay đổi: ${failure.message}',
          color: AppColors.error);
    } else {
      _snack(willSave
          ? 'Đã lưu. Scholink sẽ nhắc bạn trước hạn 7, 3 và 1 ngày trong Hộp thư.'
          : 'Đã bỏ lưu. Các nhắc hạn của cơ hội này đã được hủy.');
    }
  }

  Future<void> _toggleExternalMark() async {
    if (widget.isGuest) {
      if (widget.onBookmarkNeedsLogin != null) {
        widget.onBookmarkNeedsLogin!(_opp);
      } else {
        _snack('Đăng nhập để ghi nhận bạn đã nộp tại nguồn.');
      }
      return;
    }
    setState(() => _busyMark = true);
    final bool willMark = !_opp.isExternalMarked;
    final Failure? failure = await _vm.toggleExternalMark(_opp);
    if (!mounted) return;
    setState(() => _busyMark = false);
    if (failure != null) {
      _snack('Chưa ghi nhận được: ${failure.message}', color: AppColors.error);
    } else {
      _snack(willMark
          ? 'Đã ghi nhận bạn tự nộp tại nguồn. Đây không phải hồ sơ nộp qua Scholink.'
          : 'Đã hủy đánh dấu.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final DeadlineInfo deadline = _opp.deadlineInfo;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1.0,
        leading: const BackButton(color: Color(0xFF0F172A)),
        title: Text(
          _opp.isScholarship ? 'Chi tiết Học bổng' : 'Chi tiết Cuộc thi',
          style: const TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: <Widget>[
          // Reminder & Calendar Setup Action (F29)
          if (widget.onOpenReminderSettings != null)
            IconButton(
              key: const Key('detail_reminder_settings'),
              icon: const Icon(Icons.notification_add_outlined,
                  color: Color(0xFF0F172A)),
              tooltip: 'Nhắc hạn và lưu vào lịch',
              onPressed: widget.onOpenReminderSettings,
            ),
          // Bookmark Toggle Action
          IconButton(
            key: const Key('detail_bookmark'),
            icon: Icon(
              _opp.isBookmarked
                  ? Icons.bookmark_rounded
                  : Icons.bookmark_border_rounded,
              color:
                  _opp.isBookmarked ? const Color(0xFF4338CA) : const Color(0xFF0F172A),
              size: 24,
            ),
            tooltip: _opp.isBookmarked ? 'Bỏ lưu cơ hội' : 'Lưu cơ hội',
            onPressed: _toggleBookmark,
          ),
          // Share Action
          IconButton(
            icon: const Icon(Icons.ios_share_rounded,
                color: Color(0xFF0F172A), size: 22),
            tooltip: 'Chia sẻ cơ hội',
            onPressed: () => _snack('Đã sao chép liên kết cơ hội.'),
          ),
          const SizedBox(width: 4),
        ],
        bottom: _refreshing
            ? const PreferredSize(
                preferredSize: Size.fromHeight(2),
                child: LinearProgressIndicator(
                  minHeight: 2,
                  backgroundColor: Color(0xFFEEF2FF),
                  color: Color(0xFF4338CA),
                ),
              )
            : null,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: const Color(0xFF4338CA),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (_refreshError != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: RefreshErrorBanner(
                      key: const Key('refresh_error_banner'),
                      message: _refreshError,
                      onRetry: _refresh),
                ),

              // Cache / update notice (FR-OPP-06)
              if (_opp.formattedUpdatedAt != null)
                Container(
                  key: const Key('opportunity_cache_banner'),
                  margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.history_rounded,
                          size: 16, color: Color(0xFF64748B)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _fromCache
                              ? 'Đang xem bản lưu trên máy (thông tin cập nhật lúc ${_opp.formattedUpdatedAt}).'
                              : 'Thông tin cập nhật lúc ${_opp.formattedUpdatedAt}.',
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFF64748B)),
                        ),
                      ),
                    ],
                  ),
                ),

              // 1. Hero Banner Card (1:1 with Reference Design)
              _buildHeroBannerCard(),

              // 2. Quick Info Strip (3 Columns)
              _buildQuickInfoStrip(deadline),

              // 3. Primary CTA Button ("Đăng ký tại website nguồn")
              _buildPrimaryCtaButton(context, deadline),

              const SizedBox(height: 24),

              // 4. Section: | Giới thiệu
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: _buildSectionHeader('Giới thiệu'),
              ),
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: Text(
                  _opp.description.isEmpty
                      ? 'Ban tổ chức chưa cung cấp mô tả chi tiết cho cơ hội này.'
                      : _opp.description,
                  style: const TextStyle(
                    fontSize: 14,
                    height: 1.55,
                    color: Color(0xFF334155),
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // 5. Section: | Thông tin chính
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: _buildSectionHeader('Thông tin chính'),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: _buildMainInfoCard(deadline),
              ),

              // 6. External Source Row ("🔗 Nguồn công bố ... icpc.global ↗")
              if ((_opp.sourceUrl ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0),
                  child: _buildSourceCard(context),
                ),

              // 7. Secondary Action Button ("☑ Tự đánh dấu đã nộp")
              _buildSecondaryActionButton(context),
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================================
  // WIDGET BUILDERS
  // =========================================================================

  /// 1. Hero Banner Card
  Widget _buildHeroBannerCard() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[
            Color(0xFF1E144F),
            Color(0xFF28105A),
            Color(0xFF3B1D8F),
          ],
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x18000000),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: <Widget>[
          // Background illustration on the right with gradient fade
          Positioned(
            top: 0,
            right: 0,
            bottom: 0,
            width: 170,
            child: ShaderMask(
              shaderCallback: (Rect bounds) {
                return const LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: <Color>[
                    Colors.transparent,
                    Colors.white70,
                    Colors.white,
                  ],
                  stops: <double>[0.0, 0.4, 1.0],
                ).createShader(bounds);
              },
              blendMode: BlendMode.dstIn,
              child: Image.network(
                _opp.coverImageUrl ??
                    'https://images.unsplash.com/photo-1522071823991-b9671e9d7fbd?auto=format&fit=crop&w=500&q=80',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ),

          // Content Column
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                // Pill badge (White with trophy icon & text)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(
                        _opp.isScholarship
                            ? Icons.school_rounded
                            : Icons.emoji_events_rounded,
                        size: 14,
                        color: const Color(0xFF4338CA),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _opp.typeDisplay,
                        style: const TextStyle(
                          color: Color(0xFF4338CA),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 260),
                  child: Text(
                    _opp.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      height: 1.3,
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(height: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 240),
                  child: Text(
                    _opp.organizerName,
                    style: const TextStyle(
                      color: Color(0xFFE2E8F0),
                      fontSize: 13,
                      height: 1.3,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 2. Quick Info Strip (3 Columns with vertical dividers)
  Widget _buildQuickInfoStrip(DeadlineInfo deadline) {
    final String deadlineText = deadline.isDueToday
        ? 'Hôm nay, 23:59'
        : (deadline.isExpired ? 'Đã hết hạn' : deadline.formattedDate);
    final String modeText =
        _opp.isTeamCompetition ? 'Thi theo đội' : 'Cá nhân';
    final String locationText =
        _opp.tags.isNotEmpty ? _opp.tags.first : 'Toàn quốc';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          final double textScale = MediaQuery.textScalerOf(context).scale(1.0);
          if (constraints.maxWidth < 340 || textScale > 1.2) {
            return Column(
              children: <Widget>[
                _buildQuickInfoItem(
                  icon: Icons.calendar_month_outlined,
                  label: 'Hạn đăng ký',
                  value: deadlineText,
                ),
                const SizedBox(height: 8),
                _buildQuickInfoItem(
                  icon: Icons.groups_outlined,
                  label: 'Hình thức',
                  value: modeText,
                ),
                const SizedBox(height: 8),
                _buildQuickInfoItem(
                  icon: Icons.location_on_outlined,
                  label: 'Phạm vi',
                  value: locationText,
                ),
              ],
            );
          }
          return Row(
            children: <Widget>[
              Expanded(
                child: _buildQuickInfoItem(
                  icon: Icons.calendar_month_outlined,
                  label: 'Hạn đăng ký',
                  value: deadlineText,
                ),
              ),
              Container(height: 32, width: 1, color: const Color(0xFFE2E8F0)),
              Expanded(
                child: _buildQuickInfoItem(
                  icon: Icons.groups_outlined,
                  label: 'Hình thức',
                  value: modeText,
                ),
              ),
              Container(height: 32, width: 1, color: const Color(0xFFE2E8F0)),
              Expanded(
                child: _buildQuickInfoItem(
                  icon: Icons.location_on_outlined,
                  label: 'Phạm vi',
                  value: locationText,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildQuickInfoItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          Icon(icon, size: 20, color: const Color(0xFF4F46E5)),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF64748B),
                    fontWeight: FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 3. Primary CTA Button
  Widget _buildPrimaryCtaButton(BuildContext context, DeadlineInfo deadline) {
    if (_opp.isExternal) {
      return Container(
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 48),
        child: ElevatedButton(
          key: const Key('detail_open_source'),
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF4338CA),
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: (_opp.sourceUrl ?? '').isEmpty
              ? null
              : () => _handleOpenExternalSource(context),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.open_in_new_rounded, size: 18),
              SizedBox(width: 8),
              Flexible(
                child: Text(
                  'Đăng ký tại website nguồn',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                ),
              ),
              SizedBox(width: 4),
              Icon(Icons.north_east_rounded, size: 16),
            ],
          ),
        ),
      );
    }

    // IN_APP mode
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 48),
      child: ElevatedButton.icon(
        key: const Key('detail_apply'),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4338CA),
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        icon: Icon(
            deadline.isExpired ? Icons.block_rounded : Icons.send_rounded,
            size: 18),
        label: Text(
          deadline.isExpired ? 'Đã đóng đăng ký' : 'Nộp hồ sơ trực tuyến',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          textAlign: TextAlign.center,
        ),
        onPressed: deadline.isExpired
            ? null
            : () => _handleOnlineApplication(context),
      ),
    );
  }

  /// 4 & 5. Section Header with vertical blue bar
  Widget _buildSectionHeader(String title) {
    return Row(
      children: <Widget>[
        Container(
          width: 3.5,
          height: 18,
          decoration: BoxDecoration(
            color: const Color(0xFF3B82F6),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
        ),
      ],
    );
  }

  /// 5. Main Information Card
  Widget _buildMainInfoCard(DeadlineInfo deadline) {
    final String deadlineValue = deadline.formattedDate.isNotEmpty
        ? deadline.formattedDate
        : 'Đang cập nhật';
    final String audienceValue = _opp.tags.length > 1
        ? _opp.tags[1]
        : (_opp.eligibilityRules.isNotEmpty
            ? _opp.eligibilityRules.first
            : 'Sinh viên đại học & cao đẳng');
    final String modeDetail = _opp.isTeamCompetition
        ? 'Theo đội (3 thành viên)'
        : 'Thi cá nhân';
    final String locationValue =
        _opp.tags.isNotEmpty ? _opp.tags.first : 'Toàn quốc';

    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: <Widget>[
          _buildInfoRow(
            icon: Icons.calendar_today_outlined,
            label: 'Hạn đăng ký',
            value: deadlineValue,
          ),
          const Divider(height: 20, color: Color(0xFFF1F5F9)),
          _buildInfoRow(
            icon: Icons.people_outline_rounded,
            label: 'Đối tượng',
            value: audienceValue,
          ),
          const Divider(height: 20, color: Color(0xFFF1F5F9)),
          _buildInfoRow(
            icon: Icons.groups_outlined,
            label: 'Hình thức thi',
            value: modeDetail,
          ),
          const Divider(height: 20, color: Color(0xFFF1F5F9)),
          _buildInfoRow(
            icon: Icons.location_on_outlined,
            label: 'Phạm vi',
            value: locationValue,
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Builder(
      builder: (BuildContext context) {
        final double textScale = MediaQuery.textScalerOf(context).scale(1.0);
        if (textScale > 1.3) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Icon(icon, size: 20, color: const Color(0xFF475569)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(
                        fontSize: 13.5,
                        color: Color(0xFF475569),
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.only(left: 28.0),
                child: Text(
                  value,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ),
            ],
          );
        }
        return Row(
          children: <Widget>[
            Icon(icon, size: 20, color: const Color(0xFF475569)),
            const SizedBox(width: 12),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 13.5,
                  color: Color(0xFF475569),
                  fontWeight: FontWeight.w400,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                value,
                textAlign: TextAlign.end,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0F172A),
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        );
      },
    );
  }

  /// 6. External Source Card
  Widget _buildSourceCard(BuildContext context) {
    final double textScale = MediaQuery.textScalerOf(context).scale(1.0);
    return InkWell(
      onTap: () => _handleOpenExternalSource(context),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: textScale > 1.3
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Row(
                    children: <Widget>[
                      Icon(Icons.link_rounded,
                          size: 20, color: Color(0xFF4F46E5)),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Nguồn công bố',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: <Widget>[
                      Flexible(
                        child: Text(
                          _opp.sourceUrl!,
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF4F46E5),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.open_in_new_rounded,
                          size: 14, color: Color(0xFF4F46E5)),
                    ],
                  ),
                ],
              )
            : Row(
                children: <Widget>[
                  const Icon(Icons.link_rounded,
                      size: 20, color: Color(0xFF4F46E5)),
                  const SizedBox(width: 10),
                  const Text(
                    'Nguồn công bố',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: <Widget>[
                        Flexible(
                          child: Text(
                            _opp.sourceUrl!,
                            textAlign: TextAlign.end,
                            style: const TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF4F46E5),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.open_in_new_rounded,
                            size: 14, color: Color(0xFF4F46E5)),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  /// 7. Secondary Action Button ("☑ Tự đánh dấu đã nộp")
  Widget _buildSecondaryActionButton(BuildContext context) {
    if (!_opp.isExternal) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 48),
      child: OutlinedButton(
        key: const Key('detail_external_mark'),
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFF4338CA),
          side: const BorderSide(color: Color(0xFF4338CA), width: 1.2),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        onPressed: _busyMark ? null : _toggleExternalMark,
        child: _busyMark
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Color(0xFF4338CA)))
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(
                    _opp.isExternalMarked
                        ? Icons.check_box_rounded
                        : Icons.check_box_outline_blank_rounded,
                    size: 20,
                    color: const Color(0xFF4338CA),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      _opp.isExternalMarked
                          ? 'Đã tự đánh dấu đã nộp'
                          : 'Tự đánh dấu đã nộp',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  // =========================================================================
  // ACTIONS & DIALOGS
  // =========================================================================

  /// FR-APP-04: Mở nguồn không gửi hồ sơ/token, cảnh báo rời Scholink
  void _handleOpenExternalSource(BuildContext context) {
    final Uri? uri = Uri.tryParse(_opp.sourceUrl ?? '');
    final bool valid = uri != null &&
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.host.isNotEmpty;
    if (!valid) {
      _snack('Liên kết nguồn không hợp lệ.', color: AppColors.error);
      return;
    }
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: const Row(
            children: <Widget>[
              Icon(Icons.shield_outlined, color: AppColors.warning),
              SizedBox(width: 8),
              Flexible(
                  child: Text('Chuyển hướng an toàn',
                      style: TextStyle(fontSize: 17))),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Bạn sắp rời khỏi ứng dụng Scholink để truy cập trang web của Ban tổ chức:',
                  style: TextStyle(fontSize: 14),
                ),
                const SizedBox(height: 8),
                Text(
                  uri.host,
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: Colors.amber.shade300),
                  ),
                  child: const Text(
                    'Cam kết bảo mật (FR-APP-04): Scholink tuyệt đối KHÔNG đính kèm Access Token, dữ liệu định danh hay hồ sơ Passport của bạn sang website nguồn.',
                    style: TextStyle(fontSize: 12.5, color: Colors.brown),
                  ),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
                onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
            ElevatedButton(
              key: const Key('detail_open_source_confirm'),
              onPressed: () async {
                Navigator.pop(ctx);
                bool opened = false;
                try {
                  opened = await widget.openLink(uri);
                } catch (_) {
                  opened = false;
                }
                if (!mounted) return;
                if (!opened) {
                  _snack(
                      'Không mở được trình duyệt. Địa chỉ nguồn: ${uri.toString()}',
                      color: AppColors.error);
                }
              },
              child: const Text('Tiếp tục mở liên kết'),
            ),
          ],
        );
      },
    );
  }

  /// Nộp yêu cầu online (Bắt buộc kết nối trực tuyến & xác thực)
  void _handleOnlineApplication(BuildContext context) {
    if (_vm.isOffline) {
      showDialog<void>(
        context: context,
        builder: (BuildContext ctx) => AlertDialog(
          title: const Text('Yêu cầu kết nối trực tuyến'),
          content: const Text(
            'Thao tác nộp hồ sơ cần kết nối Internet. Thiết bị đang ở chế độ ngoại tuyến, hãy thử lại khi có mạng.',
          ),
          actions: <Widget>[
            TextButton(
                onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
          ],
        ),
      );
      return;
    }

    if (widget.onApplyInApp != null) {
      widget.onApplyInApp!();
      return;
    }

    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(widget.isGuest
            ? 'Yêu cầu tài khoản sinh viên'
            : 'Chưa thể nộp từ màn hình này'),
        content: Text(
          widget.isGuest
              ? 'Bạn đang ở Chế độ Khách. Vui lòng đăng nhập tài khoản sinh viên để nộp hồ sơ trực tuyến.'
              : 'Luồng nộp hồ sơ chưa được kết nối ở màn hình này. Không có dữ liệu nào được gửi đi.',
        ),
        actions: <Widget>[
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
        ],
      ),
    );
  }
}
