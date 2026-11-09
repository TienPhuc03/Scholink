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

Future<bool> openInExternalBrowser(Uri uri) => launchUrl(uri, mode: LaunchMode.externalApplication);

/// Detailed view for Opportunity (FR-OPP-04, FR-OPP-06, FR-APP-04, BR10, BR11).
/// Displays eligibility conditions, source info, separate deadlines, safe external link opening,
/// self-marking external registration, and online application requirements.
///
/// F29: the screen reloads the opportunity when it opens, says when it shows a saved copy, and
/// shares the catalog view model so a bookmark changed here is the same in the list.
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
    final Result<OpportunityDetail, Failure> res = await _vm.refreshDetail(_opp.id);
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
      ..showSnackBar(SnackBar(content: Text(message), backgroundColor: color, duration: const Duration(seconds: 3)));
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
      _snack('Chưa lưu được thay đổi: ${failure.message}', color: AppColors.error);
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
      appBar: AppBar(
        title: Text(_opp.isScholarship ? 'Chi tiết Học bổng' : 'Chi tiết Cuộc thi'),
        actions: <Widget>[
          // Reminder & Calendar Setup Action (Tuần 3 / F29)
          if (widget.onOpenReminderSettings != null)
            IconButton(
              key: const Key('detail_reminder_settings'),
              icon: const Icon(Icons.notification_add_outlined),
              tooltip: 'Nhắc hạn và lưu vào lịch',
              onPressed: widget.onOpenReminderSettings,
            ),
          // Bookmark Toggle Action
          IconButton(
            key: const Key('detail_bookmark'),
            icon: Icon(
              _opp.isBookmarked ? Icons.bookmark_rounded : Icons.bookmark_outline_rounded,
              color: _opp.isBookmarked ? AppColors.primary : null,
            ),
            tooltip: _opp.isBookmarked ? 'Bỏ lưu cơ hội' : 'Lưu cơ hội',
            onPressed: _toggleBookmark,
          ),
        ],
        bottom: _refreshing
            ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
            : null,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (_refreshError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: RefreshErrorBanner(message: _refreshError, onRetry: _refresh),
                ),

              // Cache / update notice (FR-OPP-06)
              if (_opp.formattedUpdatedAt != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.history_rounded, size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _fromCache
                              ? 'Đang xem bản lưu trên máy (thông tin cập nhật lúc ${_opp.formattedUpdatedAt}).'
                              : 'Thông tin cập nhật lúc ${_opp.formattedUpdatedAt}.',
                          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                ),

              // Header Badges
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: <Widget>[
                  _Badge(
                    text: _opp.typeDisplay,
                    color: _opp.isScholarship ? AppColors.primary : AppColors.secondary,
                  ),
                  _Badge(
                    text: _opp.isInApp ? 'Nộp trực tuyến (IN_APP)' : 'Đăng ký nguồn (EXTERNAL)',
                    color: _opp.isInApp ? AppColors.success : Colors.purple[800]!,
                  ),
                  if (_opp.fundingLevel != null)
                    _Badge(
                      text: switch (_opp.fundingLevel) {
                        'FULL' => 'Tài trợ 100%',
                        'PARTIAL' => 'Tài trợ một phần',
                        'FREE_ENTRY' => 'Miễn phí tham gia',
                        _ => 'Hỗ trợ khác',
                      },
                      color: AppColors.textSecondary,
                    ),
                  if (_opp.competitionMode != null)
                    _Badge(
                      text: _opp.isTeamCompetition ? 'Thi theo Đội' : 'Thi Cá nhân',
                      color: AppColors.textSecondary,
                    ),
                ],
              ),
              const SizedBox(height: 14),

              // Title
              Text(
                _opp.title,
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.bold,
                  height: 1.3,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 10),

              // Organizer Info
              Row(
                children: <Widget>[
                  const Icon(Icons.corporate_fare_rounded, size: 18, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _opp.organizerName,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              _DeadlineCard(opp: _opp, deadline: deadline),
              const SizedBox(height: 20),

              // Description Section
              const _SectionTitle('Mô tả chi tiết'),
              const SizedBox(height: 8),
              Text(
                _opp.description.isEmpty ? 'Ban tổ chức chưa cung cấp mô tả.' : _opp.description,
                style: const TextStyle(fontSize: 14.5, height: 1.5, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 20),

              // Eligibility Rules Section (FR-OPP-04)
              if (_opp.eligibilityRules.isNotEmpty) ...<Widget>[
                const _SectionTitle('Điều kiện tham gia & Hồ sơ yêu cầu'),
                const SizedBox(height: 10),
                ..._opp.eligibilityRules.map((String rule) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8.0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        const Icon(Icons.check_circle_outline_rounded, size: 18, color: AppColors.success),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            rule,
                            style: const TextStyle(fontSize: 14, color: AppColors.textPrimary, height: 1.35),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 20),
              ],

              // Source URL Info Section
              if ((_opp.sourceUrl ?? '').isNotEmpty) ...<Widget>[
                const _SectionTitle('Nguồn công bố chính thức'),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.link_rounded, size: 18, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _opp.sourceUrl!,
                          style: const TextStyle(fontSize: 13, color: AppColors.primary),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
              ],

              // Application Actions Section (FR-APP-04 & Online Requirements)
              _buildApplicationSection(context, deadline),
              const SizedBox(height: 30),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildApplicationSection(BuildContext context, DeadlineInfo deadline) {
    if (_opp.isExternal) {
      // EXTERNAL MODE (FR-APP-04)
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          ElevatedButton.icon(
            key: const Key('detail_open_source'),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              backgroundColor: Colors.purple[700],
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.open_in_new_rounded),
            label: const Text('Đăng ký tại website nguồn'),
            onPressed: (_opp.sourceUrl ?? '').isEmpty ? null : () => _handleOpenExternalSource(context),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            key: const Key('detail_external_mark'),
            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 12)),
            icon: _busyMark
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Icon(
                    _opp.isExternalMarked ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
                    color: _opp.isExternalMarked ? AppColors.success : null,
                  ),
            label: Text(
              _opp.isExternalMarked ? 'Đã tự đánh dấu nộp tại nguồn' : 'Tự đánh dấu đã nộp tại nguồn',
              textAlign: TextAlign.center,
            ),
            onPressed: _busyMark ? null : _toggleExternalMark,
          ),
          const SizedBox(height: 6),
          const Text(
            'Đánh dấu này chỉ để bạn tự theo dõi; Scholink không nhận hay xác minh hồ sơ nộp tại nguồn.',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
        ],
      );
    }

    // IN_APP MODE (BR11: closed opportunities cannot be applied to)
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        ElevatedButton.icon(
          key: const Key('detail_apply'),
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 14),
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          icon: Icon(deadline.isExpired ? Icons.block_rounded : Icons.send_rounded),
          label: Text(deadline.isExpired ? 'Đã đóng đăng ký' : 'Nộp hồ sơ trực tuyến'),
          onPressed: deadline.isExpired ? null : () => _handleOnlineApplication(context),
        ),
      ],
    );
  }

  /// FR-APP-04: Mở nguồn không gửi hồ sơ/token, cảnh báo rời Scholink
  void _handleOpenExternalSource(BuildContext context) {
    final Uri? uri = Uri.tryParse(_opp.sourceUrl ?? '');
    final bool valid = uri != null && (uri.scheme == 'https' || uri.scheme == 'http') && uri.host.isNotEmpty;
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
              Flexible(child: Text('Chuyển hướng an toàn', style: TextStyle(fontSize: 17))),
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
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.primary),
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
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
            ElevatedButton(
              key: const Key('detail_open_source_confirm'),
              onPressed: () async {
                Navigator.pop(ctx);
                // Only the public URL leaves the app: no token, no query added (APP-04).
                bool opened = false;
                try {
                  opened = await widget.openLink(uri);
                } catch (_) {
                  opened = false;
                }
                if (!mounted) return;
                if (!opened) {
                  _snack('Không mở được trình duyệt. Địa chỉ nguồn: ${uri.toString()}', color: AppColors.error);
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
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
          ],
        ),
      );
      return;
    }

    // The apply flow (TV1, F19/F28) handles guests itself: login first, then back here.
    if (widget.onApplyInApp != null) {
      widget.onApplyInApp!();
      return;
    }

    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(widget.isGuest ? 'Yêu cầu tài khoản sinh viên' : 'Chưa thể nộp từ màn hình này'),
        content: Text(
          widget.isGuest
              ? 'Bạn đang ở Chế độ Khách. Vui lòng đăng nhập tài khoản sinh viên để nộp hồ sơ trực tuyến.'
              : 'Luồng nộp hồ sơ chưa được kết nối ở màn hình này. Không có dữ liệu nào được gửi đi.',
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;

  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Text(
        text,
        style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final Color color;

  const _Badge({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
    );
  }
}

/// Deadlines (FR-OPP-04, BR10, BR11) with the timezone they are shown in.
class _DeadlineCard extends StatelessWidget {
  final OpportunityModel opp;
  final DeadlineInfo deadline;

  const _DeadlineCard({required this.opp, required this.deadline});

  @override
  Widget build(BuildContext context) {
    final Color color = deadline.isExpired ? AppColors.error : AppColors.primary;
    return Card(
      margin: EdgeInsets.zero,
      color: color.withValues(alpha: 0.06),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: color.withValues(alpha: 0.3)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  deadline.isExpired
                      ? Icons.event_busy_rounded
                      : (deadline.isDueToday ? Icons.notification_important_rounded : Icons.event_available_rounded),
                  color: color,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'HẠN ĐĂNG KÝ: ${deadline.statusText}',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              deadline.deviceZoneLabel.isEmpty
                  ? 'Thời điểm hết hạn: ${deadline.formattedDate}'
                  : 'Thời điểm hết hạn: ${deadline.formattedDate} (giờ trên máy bạn, ${deadline.deviceZoneLabel})',
              style: const TextStyle(fontSize: 13.5, color: AppColors.textPrimary),
            ),
            const SizedBox(height: 4),
            Text(
              opp.deadlineZoneDiffersFromDevice
                  ? 'Lưu ý: nguồn công bố hạn theo múi giờ ${opp.timezone}; giờ ở trên đã đổi sang giờ của bạn.'
                  : 'Múi giờ nguồn công bố: ${opp.timezone}',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),

            // BR11: Separate submit deadline from register deadline
            if (opp.formattedSubmitDeadline != null) ...<Widget>[
              const SizedBox(height: 8),
              const Divider(height: 1),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(Icons.upload_file_rounded, size: 18, color: AppColors.textSecondary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Hạn nộp bài thi/hồ sơ: ${opp.formattedSubmitDeadline}',
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
