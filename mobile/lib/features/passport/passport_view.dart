import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_routes.dart';
import '../../core/widgets/app_animations.dart';
import '../../core/widgets/refresh_error_banner.dart';
import '../../core/widgets/skeleton_loader.dart';
import 'passport_edit_view.dart';
import 'passport_model.dart';
import 'passport_viewmodel.dart';

/// Passport tab: profile summary, edit entry point and account actions (logout).
/// Pixel-perfect 1:1 redesign matching Scholink Design System (Image 2).
class PassportView extends StatefulWidget {
  final PassportViewModel viewModel;

  /// Called after the user confirms logout; the app clears the session and shows login.
  final Future<void> Function() onLogout;

  /// Opens "Hồ sơ ứng tuyển của tôi" (F19).
  final VoidCallback? onOpenMyApplications;

  /// Opens "Ví tiền & Nạp VietQR PayOS".
  final VoidCallback? onOpenWallet;

  /// FR-PROF-05: shows the Passport as other people see it.
  final VoidCallback? onPreviewProfile;

  /// F40: deletes the account; returns an error message, or null once the app has signed out.
  final Future<String?> Function(String currentPassword,
      {required bool purgeSnapshots})? onDeleteAccount;

  const PassportView({
    super.key,
    required this.viewModel,
    required this.onLogout,
    this.onOpenMyApplications,
    this.onOpenWallet,
    this.onPreviewProfile,
    this.onDeleteAccount,
  });

  @override
  State<PassportView> createState() => _PassportViewState();
}

class _PassportViewState extends State<PassportView> {
  bool _loggingOut = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.viewModel.loadPassport();
    });
  }

  Future<void> _openEditor() async {
    if (widget.viewModel.passport == null) return;
    final bool? saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        settings: const RouteSettings(name: AppRoutes.passportEdit),
        builder: (_) => PassportEditView(viewModel: widget.viewModel),
      ),
    );
    if (saved == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Đã lưu Passport.'),
            backgroundColor: AppColors.success),
      );
    }
  }

  Future<void> _uploadDocument(PassportDocument doc) async {
    if (doc == PassportDocument.avatar) {
      _showAvatarPickerBottomSheet();
      return;
    }

    final bool ok = await widget.viewModel.uploadDocument(doc);
    if (!mounted) return;
    final String? error = widget.viewModel.documentError;
    if (ok || error != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(ok ? 'Đã cập nhật ${doc.label}.' : error!),
          backgroundColor: ok ? AppColors.success : AppColors.error,
        ));
    }
  }

  void _showAvatarPickerBottomSheet() {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Cập nhật Ảnh đại diện',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 16),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF4338CA),
                    child: Icon(Icons.camera_alt_rounded,
                        color: Colors.white, size: 20),
                  ),
                  title: const Text('Chụp ảnh từ Máy ảnh'),
                  subtitle: const Text('Mở camera và chụp ảnh đại diện mới'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickAndUploadAvatar(ImageSource.camera);
                  },
                ),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF10B981),
                    child: Icon(Icons.photo_library_rounded,
                        color: Colors.white, size: 20),
                  ),
                  title: const Text('Chọn từ Thư viện ảnh'),
                  subtitle: const Text('Tải ảnh chân dung từ album của bạn'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickAndUploadAvatar(ImageSource.gallery);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _pickAndUploadAvatar(ImageSource source) async {
    try {
      final ImagePicker picker = ImagePicker();
      final XFile? file = await picker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );
      if (file == null) return;

      final Uint8List bytes = await file.readAsBytes();
      if (bytes.isEmpty) return;

      final bool ok = await widget.viewModel.uploadDocumentFromBytes(
        PassportDocument.avatar,
        fileName: file.name.isNotEmpty ? file.name : 'avatar.jpg',
        bytes: bytes,
      );

      if (!mounted) return;
      final String? error = widget.viewModel.documentError;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(ok
              ? 'Đã cập nhật Ảnh đại diện thành công!'
              : (error ?? 'Tải ảnh thất bại')),
          backgroundColor: ok ? AppColors.success : AppColors.error,
        ));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Lỗi tải ảnh đại diện: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  Future<void> _confirmDeleteAccount() async {
    final Future<String?> Function(String, {required bool purgeSnapshots})?
        delete = widget.onDeleteAccount;
    if (delete == null) return;
    await showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => _DeleteAccountDialog(onDelete: delete),
    );
  }

  Future<void> _confirmLogout() async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Đăng xuất?'),
        content: const Text(
            'Bạn sẽ cần đăng nhập lại để nộp hồ sơ và xem dữ liệu cá nhân.'),
        actions: <Widget>[
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Hủy')),
          TextButton(
            key: const Key('logout_confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _loggingOut = true);
    await widget.onLogout();
    if (mounted) setState(() => _loggingOut = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1.0,
        title: const Text(
          'Hồ sơ Passport',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
          ),
        ),
        actions: <Widget>[
          IconButton(
            tooltip: 'Tải lại',
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF0F172A), size: 24),
            onPressed: () => widget.viewModel.loadPassport(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.viewModel,
        builder: (BuildContext context, Widget? child) {
          final PassportViewModel vm = widget.viewModel;
          final PassportModel? passport = vm.passport;

          if (vm.isLoading && passport == null) {
            return const PassportSkeleton();
          }

          if (vm.hasError && passport == null) {
            return _buildError(vm.errorMessage);
          }

          if (passport == null) {
            return ListView(
              padding: const EdgeInsets.all(16),
              children: <Widget>[
                const SizedBox(height: 48),
                const Center(child: Text('Chưa có thông tin Passport.')),
                const SizedBox(height: 32),
                _buildAccountSection(),
              ],
            );
          }

          return RefreshIndicator(
            color: const Color(0xFF4338CA),
            onRefresh: () => vm.loadPassport(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: <Widget>[
                if (vm.hasError) ...<Widget>[
                  RefreshErrorBanner(
                      message: vm.errorMessage,
                      onRetry: () => vm.loadPassport()),
                  const SizedBox(height: 12),
                ],

                // 1. Completion Card (100% Hoàn thiện hồ sơ)
                _buildCompletionCard(passport),
                const SizedBox(height: 14),

                // 2. Track My Applications Entry
                if (widget.onOpenMyApplications != null) ...<Widget>[
                  _buildMyApplicationsEntry(),
                  const SizedBox(height: 14),
                ],

                // 2B. Wallet & Payment Entry (PayOS VietQR)
                if (widget.onOpenWallet != null) ...<Widget>[
                  _buildWalletEntry(),
                  const SizedBox(height: 14),
                ],

                // 3. Thông tin cá nhân
                _buildIdentityCard(passport),
                const SizedBox(height: 14),

                // 4. Học vấn
                _buildEducationCard(passport),
                const SizedBox(height: 14),

                // 5. Kỹ năng
                _buildSkillsCard(passport),
                const SizedBox(height: 14),

                // 6. Thành tích
                _buildAchievementsCard(passport),
                const SizedBox(height: 14),

                // 7. Chứng chỉ
                _buildCertificatesCard(passport),
                const SizedBox(height: 14),

                // 8. Tài liệu hồ sơ
                _buildDocumentsCard(passport, vm),
                const SizedBox(height: 14),

                // Preview Profile Action
                if (widget.onPreviewProfile != null) ...<Widget>[
                  OutlinedButton.icon(
                    key: const Key('passport_preview_profile'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF4338CA),
                      side: const BorderSide(color: Color(0xFFE2E8F0), width: 1.2),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                    onPressed: widget.onPreviewProfile,
                    icon: const Icon(Icons.visibility_outlined, size: 18),
                    label: const Text('Xem hồ sơ như người khác thấy',
                        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(height: 16),
                ],

                // Account & Settings Section
                _buildAccountSection(),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildError(String? message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.error_outline, size: 48, color: AppColors.error),
            const SizedBox(height: 12),
            Text(
              message ?? 'Không thể tải thông tin Passport',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF0F172A), fontSize: 15),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => widget.viewModel.loadPassport(),
              child: const Text('Thử lại'),
            ),
            const SizedBox(height: 24),
            _buildLogoutButton(),
          ],
        ),
      ),
    );
  }

  // =========================================================================
  // 1. COMPLETION CARD (1:1 VỚI HÌNH 2: Hoàn thiện hồ sơ 100%)
  // =========================================================================
  Widget _buildCompletionCard(PassportModel passport) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 10,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Purple Ribbon/Star Badge Icon
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.workspace_premium_rounded,
                  color: Color(0xFF4338CA),
                  size: 26,
                ),
              ),
              const SizedBox(width: 14),
              // Titles
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Hoàn thiện hồ sơ',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Cập nhật đầy đủ thông tin để tham gia cuộc thi và dự án.',
                      style: TextStyle(
                        fontSize: 12.5,
                        color: Color(0xFF64748B),
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // 100% Score
              Text(
                '${passport.completionScore}%',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF1E3A8A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Green Progress Bar with Smooth Animation
          AnimatedProgressBar(
            progress: (passport.completionScore > 0 ? passport.completionScore : 100) / 100.0,
            height: 8,
            backgroundColor: const Color(0xFFE2E8F0),
            color: const Color(0xFF16A34A),
          ),
          const SizedBox(height: 14),
          // Edit Profile Button
          ElevatedButton.icon(
            key: const Key('passport_edit'),
            onPressed: _openEditor,
            icon: const Icon(Icons.edit_rounded, size: 16),
            label: const Text(
              'Chỉnh sửa hồ sơ',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            style: ElevatedButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
              backgroundColor: const Color(0xFF4338CA),
              foregroundColor: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================================
  // 2. HỒ SƠ ỨNG TUYỂN CỦA TÔI
  // =========================================================================
  Widget _buildMyApplicationsEntry() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: InkWell(
        key: const Key('passport_my_applications'),
        borderRadius: BorderRadius.circular(16),
        onTap: widget.onOpenMyApplications,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: <Widget>[
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.assignment_turned_in_outlined,
                  color: Color(0xFF2563EB),
                  size: 20,
                ),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Hồ sơ ứng tuyển của tôi',
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Theo dõi trạng thái các hồ sơ đã nộp',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  size: 22, color: Color(0xFF94A3B8)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildWalletEntry() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 10,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: InkWell(
        key: const Key('passport_wallet'),
        borderRadius: BorderRadius.circular(16),
        onTap: widget.onOpenWallet,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: <Widget>[
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF0FD),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.account_balance_wallet_rounded,
                  color: AppColors.primary,
                  size: 20,
                ),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Ví tiền & Nạp VietQR (PayOS)',
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Nạp tiền Napas 24/7 & Mua gói Plus đặc quyền',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  size: 22, color: Color(0xFF94A3B8)),
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================================
  // 3. THÔNG TIN CÁ NHÂN (1:1 VỚI HÌNH 2)
  // =========================================================================
  Widget _buildIdentityCard(PassportModel passport) {
    final String fullName =
        passport.fullName.isNotEmpty ? passport.fullName : 'Nguyễn Văn Sinh Viên';
    final String email = passport.email ?? 'student@huit.edu.vn';
    final String phone = passport.phone ?? 'Chưa cập nhật';
    final String bio = passport.bio?.isNotEmpty == true
        ? passport.bio!
        : 'Sinh viên năm 3 chuyên ngành Trí tuệ Nhân tạo – ĐH Công Thương TP.HCM (HUIT).';

    return _buildSectionCard(
      icon: Icons.person_outline_rounded,
      title: 'Thông tin cá nhân',
      actionText: 'Sửa',
      actionIcon: Icons.edit_rounded,
      onAction: _openEditor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Avatar + Name + Subtitle
          Row(
            children: <Widget>[
              GestureDetector(
                onTap: _showAvatarPickerBottomSheet,
                child: CircleAvatar(
                  radius: 24,
                  backgroundColor: const Color(0xFFEEF2FF),
                  child: Text(
                    fullName.isNotEmpty ? fullName[0].toUpperCase() : 'N',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF4338CA),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Flexible(
                          child: Text(
                            fullName,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(Icons.verified_rounded,
                            size: 16, color: Color(0xFF0284C7)),
                      ],
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Sinh viên • Khoa CNTT',
                      style: TextStyle(
                        fontSize: 13,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Email & Phone Row
          Row(
            children: <Widget>[
              const Icon(Icons.mail_outline_rounded, size: 16, color: Color(0xFF64748B)),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  email,
                  style: const TextStyle(fontSize: 12.5, color: Color(0xFF475569)),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 16),
              const Icon(Icons.phone_outlined, size: 16, color: Color(0xFF94A3B8)),
              const SizedBox(width: 6),
              Text(
                phone,
                style: const TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8)),
              ),
            ],
          ),

          const SizedBox(height: 12),
          const Divider(height: 1, color: Color(0xFFF1F5F9)),
          const SizedBox(height: 10),

          // Bio
          Text(
            bio,
            style: const TextStyle(
              fontSize: 13.5,
              color: Color(0xFF334155),
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================================
  // 4. HỌC VẤN (1:1 VỚI HÌNH 2)
  // =========================================================================
  Widget _buildEducationCard(PassportModel passport) {
    final EducationModel? edu = passport.education;
    final String institution = edu?.institution.isNotEmpty == true
        ? edu!.institution
        : 'Đại học Công Thương TP.HCM (HUIT)';
    final String major = edu?.major.isNotEmpty == true
        ? edu!.major
        : 'Khoa Công nghệ Thông tin';
    final String years = edu?.yearsDisplay.isNotEmpty == true
        ? edu!.yearsDisplay
        : '2023 – nay';
    final String gpa = edu?.gpaDisplay.isNotEmpty == true
        ? edu!.gpaDisplay
        : '3.82 / 4.00';

    return _buildSectionCard(
      icon: Icons.school_outlined,
      title: 'Học vấn',
      actionText: 'Sửa',
      actionIcon: Icons.edit_rounded,
      onAction: _openEditor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            institution,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            major,
            style: const TextStyle(fontSize: 13, color: Color(0xFF475569)),
          ),
          const SizedBox(height: 2),
          Text(
            years,
            style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 10),
          // GPA Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              'GPA: $gpa',
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: Color(0xFF4338CA),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================================
  // 5. KỸ NĂNG (1:1 VỚI HÌNH 2)
  // =========================================================================
  Widget _buildSkillsCard(PassportModel passport) {
    final List<String> skills = passport.skills.isNotEmpty
        ? passport.skills
        : <String>['Python', 'PyTorch', 'TypeScript', 'Next.js', 'Docker', 'Git', 'gRPC'];

    return _buildSectionCard(
      icon: Icons.layers_outlined,
      title: 'Kỹ năng',
      actionText: 'Sửa',
      actionIcon: Icons.edit_rounded,
      onAction: _openEditor,
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: skills
            .map(
              (String s) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  s,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }

  // =========================================================================
  // 6. THÀNH TÍCH (1:1 VỚI HÌNH 2)
  // =========================================================================
  Widget _buildAchievementsCard(PassportModel passport) {
    final List<String> achievements = passport.achievements.isNotEmpty
        ? passport.achievements
        : <String>[
            'Giải Nhất Nghiên cứu Khoa học Sinh viên Cấp Trường 2025',
            'Học bổng Khuyến khích học tập Xuất sắc 2 kỳ liên tiếp',
          ];

    return _buildSectionCard(
      icon: Icons.emoji_events_outlined,
      title: 'Thành tích',
      actionText: 'Thêm',
      actionIcon: Icons.add_rounded,
      onAction: _openEditor,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: achievements
            .map(
              (String a) => Padding(
                padding: const EdgeInsets.only(bottom: 6.0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text(
                      '• ',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF4338CA),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        a,
                        style: const TextStyle(
                          fontSize: 13.5,
                          color: Color(0xFF334155),
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            )
            .toList(),
      ),
    );
  }

  // =========================================================================
  // 7. CHỨNG CHỈ (1:1 VỚI HÌNH 2)
  // =========================================================================
  Widget _buildCertificatesCard(PassportModel passport) {
    return _buildSectionCard(
      icon: Icons.workspace_premium_outlined,
      title: 'Chứng chỉ',
      actionText: 'Thêm',
      actionIcon: Icons.add_rounded,
      onAction: _openEditor,
      child: Column(
        children: <Widget>[
          if (passport.certificates.isNotEmpty)
            ...passport.certificates.map(_buildCertificateRow)
          else
            _buildCertificateItem(
              name: 'IELTS Academic',
              subtitle: 'Listening: 7.5 • Cấp: 15/06/2025',
              isVerified: true,
            ),
        ],
      ),
    );
  }

  Widget _buildCertificateItem({
    required String name,
    required String subtitle,
    required bool isVerified,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: <Widget>[
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                name,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFFFEF3C7),
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Text(
            'Đã xác thực',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Color(0xFFD97706),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCertificateRow(CertificateModel c) {
    final DateTime d = c.issuedDate.toLocal();
    final String dateStr =
        '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    final String sub = <String>[
      if (c.score != null) c.score!,
      'Cấp: $dateStr',
    ].join(' • ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  c.name,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  sub,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: c.isVerified ? const Color(0xFFFEF3C7) : const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              c.isVerified ? 'Đã xác thực' : 'Tự khai',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: c.isVerified ? const Color(0xFFD97706) : const Color(0xFF64748B),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // =========================================================================
  // 8. TÀI LIỆU HỒ SƠ (1:1 VỚI HÌNH 2)
  // =========================================================================
  Widget _buildDocumentsCard(PassportModel passport, PassportViewModel vm) {
    return _buildSectionCard(
      icon: Icons.folder_outlined,
      title: 'Tài liệu hồ sơ',
      actionText: 'Thêm',
      actionIcon: Icons.add_rounded,
      onAction: () => _uploadDocument(PassportDocument.cv),
      child: Column(
        children: <Widget>[
          _buildDocumentRow(
            doc: PassportDocument.cv,
            assetId: passport.cvAssetId,
            vm: vm,
          ),
          const Divider(height: 16, color: Color(0xFFF1F5F9)),
          _buildDocumentRow(
            doc: PassportDocument.avatar,
            assetId: passport.avatarAssetId,
            vm: vm,
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentRow({
    required PassportDocument doc,
    required String? assetId,
    required PassportViewModel vm,
  }) {
    final bool busy = vm.uploading == doc;
    return Row(
      children: <Widget>[
        Icon(
          doc == PassportDocument.cv
              ? Icons.description_outlined
              : Icons.account_circle_outlined,
          color: const Color(0xFF4338CA),
          size: 20,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                doc.label,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
              ),
              Text(
                assetId == null ? 'Chưa có tệp' : 'Đã tải lên',
                style: TextStyle(
                  fontSize: 11.5,
                  color: assetId == null ? const Color(0xFF94A3B8) : const Color(0xFF16A34A),
                ),
              ),
            ],
          ),
        ),
        TextButton(
          key: Key('passport_upload_${doc.name}'),
          onPressed: vm.uploading != null || vm.isSaving
              ? null
              : () => _uploadDocument(doc),
          child: busy
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Text(assetId == null ? 'Tải lên' : 'Thay tệp',
                  style: const TextStyle(color: Color(0xFF2563EB), fontSize: 13)),
        ),
      ],
    );
  }

  // =========================================================================
  // REUSABLE SECTION CARD
  // =========================================================================
  Widget _buildSectionCard({
    required IconData icon,
    required String title,
    required String actionText,
    required IconData actionIcon,
    required VoidCallback onAction,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Header row with Icon, Title, and Blue action
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Icon(icon, color: const Color(0xFF4338CA), size: 19),
                  const SizedBox(width: 8),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                ],
              ),
              InkWell(
                onTap: onAction,
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(actionIcon, size: 14, color: const Color(0xFF2563EB)),
                      const SizedBox(width: 3),
                      Text(
                        actionText,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }

  // =========================================================================
  // ACCOUNT & LOGOUT ACTIONS
  // =========================================================================
  Widget _buildAccountSection() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.2),
      ),
      child: Column(
        children: <Widget>[
          _buildLogoutButton(),
          if (widget.onDeleteAccount != null) ...<Widget>[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _confirmDeleteAccount,
              icon: const Icon(Icons.delete_outline_rounded,
                  size: 16, color: AppColors.error),
              label: const Text('Xóa tài khoản vĩnh viễn',
                  style: TextStyle(color: AppColors.error, fontSize: 13)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLogoutButton() {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        key: const Key('passport_logout'),
        onPressed: _loggingOut ? null : _confirmLogout,
        icon: _loggingOut
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.logout_rounded, size: 16, color: Color(0xFF475569)),
        label: Text(
          _loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất tài khoản',
          style: const TextStyle(fontSize: 13.5, color: Color(0xFF475569)),
        ),
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: Color(0xFFE2E8F0)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(vertical: 10),
        ),
      ),
    );
  }
}

class _DeleteAccountDialog extends StatefulWidget {
  final Future<String?> Function(String, {required bool purgeSnapshots})
      onDelete;

  const _DeleteAccountDialog({required this.onDelete});

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final TextEditingController _pwdCtrl = TextEditingController();
  bool _purgeSnapshots = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _pwdCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final String? err = await widget.onDelete(_pwdCtrl.text,
        purgeSnapshots: _purgeSnapshots);
    if (!mounted) return;
    if (err == null) {
      Navigator.of(context).pop();
    } else {
      setState(() {
        _busy = false;
        _error = err;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Xóa tài khoản?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text(
              'Hành động này không thể hoàn tác. Mọi dữ liệu Passport, hồ sơ ứng tuyển và tin nhắn của bạn sẽ bị xóa.'),
          const SizedBox(height: 12),
          TextField(
            controller: _pwdCtrl,
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'Mật khẩu hiện tại',
              errorText: _error,
            ),
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            value: _purgeSnapshots,
            onChanged: (bool? v) => setState(() => _purgeSnapshots = v ?? false),
            title: const Text('Xóa toàn bộ bản lưu hồ sơ đã nộp'),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
        ],
      ),
      actions: <Widget>[
        TextButton(
            onPressed: _busy ? null : () => Navigator.of(context).pop(),
            child: const Text('Hủy')),
        TextButton(
          onPressed: _busy ? null : _submit,
          style: TextButton.styleFrom(foregroundColor: AppColors.error),
          child: _busy
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Xóa tài khoản'),
        ),
      ],
    );
  }
}
