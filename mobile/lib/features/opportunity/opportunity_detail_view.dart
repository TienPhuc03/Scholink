import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'opportunity_model.dart';
import 'opportunity_viewmodel.dart';

/// Detailed view for Opportunity (FR-OPP-04, FR-OPP-06, FR-APP-04, BR10, BR11).
/// Displays eligibility conditions, source info, separate deadlines, safe external link opening,
/// self-marking external registration, and online application requirements.
class OpportunityDetailView extends StatefulWidget {
  final OpportunityModel opportunity;
  final OpportunityViewModel viewModel;
  final bool isGuest;
  final VoidCallback? onOpenReminderSettings;

  /// F19 (TV1): starts the real IN_APP application flow. When null, the old confirmation
  /// dialog is shown instead.
  final VoidCallback? onApplyInApp;

  const OpportunityDetailView({
    super.key,
    required this.opportunity,
    required this.viewModel,
    this.isGuest = false,
    this.onOpenReminderSettings,
    this.onApplyInApp,
  });

  @override
  State<OpportunityDetailView> createState() => _OpportunityDetailViewState();
}

class _OpportunityDetailViewState extends State<OpportunityDetailView> {
  late OpportunityModel _opp;

  @override
  void initState() {
    super.initState();
    _opp = widget.opportunity;
  }

  @override
  Widget build(BuildContext context) {
    final DeadlineInfo deadline = _opp.deadlineInfo;

    return Scaffold(
      appBar: AppBar(
        title: Text(_opp.isScholarship ? 'Chi tiết Học bổng' : 'Chi tiết Cuộc thi'),
        actions: <Widget>[
          // Reminder & Calendar Setup Action (Tuần 3)
          IconButton(
            icon: const Icon(Icons.notification_add_outlined),
            tooltip: 'Cài đặt nhắc hạn & Lịch',
            onPressed: widget.onOpenReminderSettings,
          ),
          // Bookmark Toggle Action
          IconButton(
            icon: Icon(
              _opp.isBookmarked ? Icons.bookmark_rounded : Icons.bookmark_outline_rounded,
              color: _opp.isBookmarked ? AppColors.primary : null,
            ),
            tooltip: _opp.isBookmarked ? 'Bỏ lưu' : 'Lưu cơ hội',
            onPressed: () async {
              await widget.viewModel.toggleBookmark(_opp);
              setState(() {
                _opp = _opp.copyWith(isBookmarked: !_opp.isBookmarked);
              });
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      _opp.isBookmarked
                          ? 'Đã lưu cơ hội vào danh sách Bookmark'
                          : 'Đã xóa khỏi danh sách Bookmark',
                    ),
                    duration: const Duration(seconds: 2),
                  ),
                );
              }
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Offline / Cache update notice banner (FR-OPP-06)
            if (_opp.updatedAt != null)
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
                        'Dữ liệu cache (Cập nhật lúc: ${_opp.updatedAt})',
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),

            // Header Badges
            Row(
              children: <Widget>[
                // Type Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: _opp.isScholarship
                        ? AppColors.primary.withOpacity(0.12)
                        : AppColors.secondary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _opp.typeDisplay,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: _opp.isScholarship ? AppColors.primary : AppColors.secondary,
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Apply Mode Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: _opp.isInApp
                        ? AppColors.success.withOpacity(0.12)
                        : Colors.purple.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _opp.isInApp ? 'Nộp trực tuyến (IN_APP)' : 'Đăng ký nguồn (EXTERNAL)',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: _opp.isInApp ? AppColors.success : Colors.purple[800],
                    ),
                  ),
                ),

                const Spacer(),

                // Funding Level / Competition Mode Badge
                if (_opp.fundingLevel != null)
                  Chip(
                    label: Text(
                      _opp.fundingLevel == 'FULL' ? 'Tài trợ 100%' : 'Tài trợ một phần',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                    padding: EdgeInsets.zero,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                if (_opp.competitionMode != null)
                  Chip(
                    label: Text(
                      _opp.competitionMode == 'TEAM' ? 'Thi theo Đội' : 'Thi Cá nhân',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                    padding: EdgeInsets.zero,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
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

            // Deadlines Card (FR-OPP-04, BR10, BR11)
            Card(
              color: deadline.isExpired
                  ? AppColors.error.withOpacity(0.06)
                  : AppColors.primary.withOpacity(0.06),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: deadline.isExpired
                      ? AppColors.error.withOpacity(0.3)
                      : AppColors.primary.withOpacity(0.3),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Icon(
                          deadline.isExpired
                              ? Icons.event_busy_rounded
                              : (deadline.isDueToday ? Icons.notification_important_rounded : Icons.event_available_rounded),
                          color: deadline.isExpired ? AppColors.error : AppColors.primary,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'HẠN ĐĂNG KÝ: ${deadline.statusText}',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: deadline.isExpired ? AppColors.error : AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Thời điểm hết hạn: ${deadline.formattedDate} (${_opp.timezone})',
                      style: const TextStyle(fontSize: 13.5, color: AppColors.textPrimary),
                    ),

                    // BR11: Separate submit deadline from register deadline
                    if (_opp.formattedSubmitDeadline != null) ...<Widget>[
                      const SizedBox(height: 8),
                      const Divider(height: 1),
                      const SizedBox(height: 8),
                      Row(
                        children: <Widget>[
                          const Icon(Icons.upload_file_rounded, size: 18, color: AppColors.textSecondary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Hạn nộp bài thi/hồ sơ: ${_opp.formattedSubmitDeadline}',
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
            ),
            const SizedBox(height: 20),

            // Description Section
            const Text(
              'Mô tả chi tiết',
              style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
            ),
            const SizedBox(height: 8),
            Text(
              _opp.description,
              style: const TextStyle(fontSize: 14.5, height: 1.5, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),

            // Eligibility Rules Section (FR-OPP-04)
            if (_opp.eligibilityRules.isNotEmpty) ...<Widget>[
              const Text(
                'Điều kiện tham gia & Hồ sơ yêu cầu',
                style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
              ),
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
            if (_opp.sourceUrl != null && _opp.sourceUrl!.isNotEmpty) ...<Widget>[
              const Text(
                'Nguồn công bố chính thức',
                style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
              ),
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
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],

            // Application Actions Section (FR-APP-04 & Online Requirements)
            _buildApplicationSection(context),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  Widget _buildApplicationSection(BuildContext context) {
    if (_opp.isExternal) {
      // EXTERNAL MODE (FR-APP-04)
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              backgroundColor: Colors.purple[700],
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.open_in_new_rounded),
            label: const Text('Đăng ký tại website nguồn'),
            onPressed: () => _handleOpenExternalSource(context),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 12)),
            icon: Icon(
              _opp.isExternalMarked ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded,
              color: _opp.isExternalMarked ? AppColors.success : null,
            ),
            label: Text(
              _opp.isExternalMarked
                  ? 'Đã tự đánh dấu nộp tại nguồn (EXTERNAL_MARKED)'
                  : 'Tự đánh dấu đã nộp tại nguồn',
            ),
            onPressed: () async {
              await widget.viewModel.toggleExternalMark(_opp);
              setState(() {
                _opp = _opp.copyWith(isExternalMarked: !_opp.isExternalMarked);
              });
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      _opp.isExternalMarked
                          ? 'Đã ghi nhận tự đánh dấu đã đăng ký tại nguồn (FR-APP-04).'
                          : 'Đã hủy tự đánh dấu.',
                    ),
                  ),
                );
              }
            },
          ),
        ],
      );
    } else {
      // IN_APP MODE
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.send_rounded),
            label: const Text('Nộp hồ sơ trực tuyến'),
            onPressed: () => _handleOnlineApplication(context),
          ),
        ],
      );
    }
  }

  /// FR-APP-04: Mở nguồn không gửi hồ sơ/token, cảnh báo rời Scholink
  void _handleOpenExternalSource(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: const Row(
            children: <Widget>[
              Icon(Icons.shield_outlined, color: AppColors.warning),
              SizedBox(width: 8),
              Text('Chuyển hướng an toàn', style: TextStyle(fontSize: 17)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text(
                'Bạn sắp rời khỏi ứng dụng Scholink để truy cập trang web của Ban tổ chức:',
                style: TextStyle(fontSize: 14),
              ),
              const SizedBox(height: 8),
              Text(
                _opp.sourceUrl ?? _opp.organizerName,
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
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Đang mở liên kết nguồn an toàn (Không truyền token/hồ sơ)...'),
                  ),
                );
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
    if (widget.viewModel.isOffline) {
      showDialog<void>(
        context: context,
        builder: (BuildContext ctx) => AlertDialog(
          title: const Text('Yêu cầu kết nối trực tuyến'),
          content: const Text(
            'Thao tác nộp hồ sơ yêu cầu kết nối mạng Internet trực tuyến. Thiết bị đang ở chế độ ngoại tuyến.',
          ),
          actions: <Widget>[
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
          ],
        ),
      );
      return;
    }

    if (widget.isGuest) {
      showDialog<void>(
        context: context,
        builder: (BuildContext ctx) => AlertDialog(
          title: const Text('Yêu cầu tài khoản sinh viên'),
          content: const Text(
            'Bạn đang ở Chế độ Khách. Vui lòng đăng nhập tài khoản sinh viên để nộp hồ sơ trực tuyến và chia sẻ Passport 100 điểm.',
          ),
          actions: <Widget>[
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
          ],
        ),
      );
      return;
    }

    // Authenticated and online
    if (widget.onApplyInApp != null) {
      widget.onApplyInApp!();
      return;
    }
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Xác nhận nộp hồ sơ trực tuyến'),
        content: Text(
          'Bạn đang nộp hồ sơ cho: "${_opp.title}".\nHồ sơ số Passport của bạn sẽ được gửi đến Ban tổ chức ${_opp.organizerName}.',
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Đã nộp hồ sơ ứng tuyển thành công! Kiểm tra trạng thái trong Hộp thư.'),
                  backgroundColor: AppColors.success,
                ),
              );
            },
            child: const Text('Xác nhận nộp'),
          ),
        ],
      ),
    );
  }
}

