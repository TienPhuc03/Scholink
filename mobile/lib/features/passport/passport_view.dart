import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_routes.dart';
import '../../core/widgets/refresh_error_banner.dart';
import 'passport_edit_view.dart';
import 'passport_model.dart';
import 'passport_viewmodel.dart';
import 'profile_view_screen.dart';

/// Passport tab: profile summary, edit entry point and account actions (logout).
class PassportView extends StatefulWidget {
  final PassportViewModel viewModel;

  /// Called after the user confirms logout; the app clears the session and shows login.
  final Future<void> Function() onLogout;

  /// Opens "Hồ sơ ứng tuyển của tôi" (F19).
  final VoidCallback? onOpenMyApplications;

  /// FR-PROF-05: shows the Passport as other people see it.
  final VoidCallback? onPreviewProfile;

  /// F40: deletes the account; returns an error message, or null once the app has signed out.
  final Future<String?> Function(String currentPassword, {required bool purgeSnapshots})? onDeleteAccount;

  const PassportView({
    super.key,
    required this.viewModel,
    required this.onLogout,
    this.onOpenMyApplications,
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
        const SnackBar(content: Text('Đã lưu Passport.'), backgroundColor: AppColors.success),
      );
    }
  }

  Future<void> _uploadDocument(PassportDocument doc) async {
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

  Future<void> _confirmDeleteAccount() async {
    final Future<String?> Function(String, {required bool purgeSnapshots})? delete = widget.onDeleteAccount;
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
        content: const Text('Bạn sẽ cần đăng nhập lại để nộp hồ sơ và xem dữ liệu cá nhân.'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Hủy')),
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
      appBar: AppBar(
        title: const Text('Hồ sơ Passport'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Tải lại',
            icon: const Icon(Icons.refresh),
            onPressed: () => widget.viewModel.loadPassport(),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.viewModel,
        builder: (BuildContext context, Widget? child) {
          final PassportViewModel vm = widget.viewModel;
          final PassportModel? passport = vm.passport;

          if (vm.isLoading && passport == null) {
            return const Center(child: CircularProgressIndicator());
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
            onRefresh: () => vm.loadPassport(),
            child: ListView(
              padding: const EdgeInsets.all(16.0),
              children: <Widget>[
                if (vm.hasError) ...<Widget>[
                  RefreshErrorBanner(message: vm.errorMessage, onRetry: () => vm.loadPassport()),
                  const SizedBox(height: 12),
                ],
                _buildCompletionCard(passport),
                if (widget.onOpenMyApplications != null) ...<Widget>[
                  const SizedBox(height: 12),
                  _buildMyApplicationsEntry(),
                ],
                if (widget.onPreviewProfile != null) ...<Widget>[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    key: const Key('passport_preview_profile'),
                    onPressed: widget.onPreviewProfile,
                    icon: const Icon(Icons.visibility_outlined, size: 18),
                    label: const Text('Xem hồ sơ như người khác thấy'),
                  ),
                ],
                const SizedBox(height: 16),
                _buildIdentityCard(passport),
                const SizedBox(height: 16),
                _buildEducationCard(passport),
                if (passport.skills.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 16),
                  _card(
                    icon: Icons.psychology_outlined,
                    title: 'Kỹ năng',
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: passport.skills
                          .map((String s) => Chip(
                                label: Text(s, style: const TextStyle(fontSize: 12)),
                                backgroundColor: AppColors.primaryLight,
                                side: BorderSide.none,
                              ))
                          .toList(),
                    ),
                  ),
                ],
                if (passport.achievements.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 16),
                  _card(
                    icon: Icons.emoji_events_outlined,
                    title: 'Thành tích',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: passport.achievements
                          .map((String a) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    const Text('•  ', style: TextStyle(color: AppColors.primary)),
                                    Expanded(child: Text(a, style: const TextStyle(fontSize: 14))),
                                  ],
                                ),
                              ))
                          .toList(),
                    ),
                  ),
                ],
                if (passport.certificates.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 16),
                  _card(
                    icon: Icons.workspace_premium_outlined,
                    title: 'Chứng chỉ',
                    child: Column(
                      children: passport.certificates.map(_buildCertificateRow).toList(),
                    ),
                  ),
                ],
                if (vm.canUploadDocuments) ...<Widget>[
                  const SizedBox(height: 16),
                  _buildDocumentsCard(passport, vm),
                ],
                const SizedBox(height: 16),
                _buildPreferencesCard(passport),
                const SizedBox(height: 24),
                _buildAccountSection(),
                const SizedBox(height: 16),
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
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 15),
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

  Widget _card({required IconData icon, required String title, required Widget child, Widget? trailing}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(icon, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontFamily: 'Be Vietnam Pro',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (trailing != null) trailing,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _buildCompletionCard(PassportModel passport) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              const Text(
                'Độ hoàn thiện Passport',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
              ),
              Text(
                '${passport.completionScore}%',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.primary),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: passport.completionScore / 100.0,
              minHeight: 8,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation<Color>(
                passport.isHighQualityProfile ? AppColors.success : AppColors.primary,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            passport.isHighQualityProfile
                ? 'Tuyệt vời! Hồ sơ đạt chuẩn cao (≥80%) tối ưu xét duyệt học bổng & ghép đội.'
                : 'Hồ sơ cần hoàn thiện trên 80% để tăng cơ hội nhận học bổng & ghép đội thi.',
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            key: const Key('passport_edit'),
            onPressed: _openEditor,
            icon: const Icon(Icons.edit_outlined, size: 16),
            label: const Text('Chỉnh sửa hồ sơ', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            style: ElevatedButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            ),
          ),
        ],
      ),
    );
  }

  /// Q6: entry to "Hồ sơ ứng tuyển của tôi" right under the completion card.
  Widget _buildMyApplicationsEntry() {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        key: const Key('passport_my_applications'),
        borderRadius: BorderRadius.circular(8),
        onTap: widget.onOpenMyApplications,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: const Row(
            children: <Widget>[
              Icon(Icons.assignment_turned_in_outlined, color: AppColors.primary),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Hồ sơ ứng tuyển của tôi',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                    SizedBox(height: 2),
                    Text('Theo dõi trạng thái các hồ sơ đã nộp',
                        style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildIdentityCard(PassportModel passport) {
    return _card(
      icon: Icons.badge_outlined,
      title: 'Thông tin cơ bản',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              PassportAvatar(key: const Key('passport_avatar'), name: passport.fullName, url: passport.avatarUrl, radius: 26),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(passport.fullName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    if (passport.regionCode != null)
                      Text(
                        'Khu vực: ${passport.regionCode}',
                        style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (passport.email != null || passport.phone != null) ...<Widget>[
            const SizedBox(height: 12),
            if (passport.email != null) _contactRow(Icons.mail_outline_rounded, passport.email!, passport.visibilityOf('email')),
            if (passport.phone != null) _contactRow(Icons.phone_outlined, passport.phone!, passport.visibilityOf('phone')),
          ],
          const Divider(height: 24, color: AppColors.borderLight),
          Text(
            passport.bio ?? 'Chưa có phần giới thiệu. Thêm vài dòng để nhà tài trợ hiểu bạn hơn.',
            style: TextStyle(
              fontSize: 14,
              color: passport.bio != null ? AppColors.textSecondary : AppColors.textMuted,
              fontStyle: passport.bio != null ? FontStyle.normal : FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }

  /// Contact detail with who can see it (FR-PROF-05).
  Widget _contactRow(IconData icon, String value, FieldVisibility visibility) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: <Widget>[
            Icon(icon, size: 16, color: AppColors.textSecondary),
            const SizedBox(width: 8),
            Expanded(child: Text(value, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis)),
            Text(visibility.label, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          ],
        ),
      );

  Widget _buildEducationCard(PassportModel passport) {
    final EducationModel? edu = passport.education;
    return _card(
      icon: Icons.school_outlined,
      title: 'Học vấn',
      child: edu == null
          ? const Text(
              'Chưa cập nhật học vấn.',
              style: TextStyle(fontSize: 14, color: AppColors.textMuted, fontStyle: FontStyle.italic),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(edu.institution, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  '${edu.major} · ${edu.yearsDisplay}',
                  style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 2),
                Text(
                  'GPA: ${edu.gpaDisplay}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.primary),
                ),
              ],
            ),
    );
  }

  Widget _buildCertificateRow(CertificateModel c) {
    final DateTime d = c.issuedDate.toLocal();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(c.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                Text(
                  <String>[
                    c.type == 'OTHER' ? 'Khác' : c.type,
                    if (c.score != null) c.score!,
                    'Cấp ${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}',
                  ].join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: (c.isVerified ? AppColors.success : AppColors.warning).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              c.isVerified ? 'Đã xác minh' : 'Tự khai',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: c.isVerified ? AppColors.success : AppColors.warning,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPreferencesCard(PassportModel p) {
    Widget row(String label, bool on) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            children: <Widget>[
              Icon(
                on ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                size: 18,
                color: on ? AppColors.success : AppColors.textMuted,
              ),
              const SizedBox(width: 8),
              Text(label, style: const TextStyle(fontSize: 14)),
            ],
          ),
        );
    return _card(
      icon: Icons.tune_rounded,
      title: 'Tùy chọn hiển thị',
      child: Column(
        children: <Widget>[
          row('Đang tìm đồng đội', p.isLookingForTeammate),
          row('Quan tâm học bổng', p.isOpenForScholarship),
          row('Sẵn sàng nhận cố vấn', p.isOpenForMentoring),
        ],
      ),
    );
  }

  /// FR-PROF-04: CV and avatar kept on the Passport. Files stay private; only the owner uploads.
  Widget _buildDocumentsCard(PassportModel passport, PassportViewModel vm) {
    Widget row(PassportDocument doc, String? assetId) {
      final bool busy = vm.uploading == doc;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: <Widget>[
            Icon(
              doc == PassportDocument.cv ? Icons.description_outlined : Icons.account_circle_outlined,
              color: AppColors.primary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(doc.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  Text(
                    assetId == null ? 'Chưa có tệp' : 'Đã tải lên',
                    style: TextStyle(fontSize: 12, color: assetId == null ? AppColors.textMuted : AppColors.success),
                  ),
                ],
              ),
            ),
            TextButton(
              key: Key('passport_upload_${doc.name}'),
              onPressed: vm.uploading != null || vm.isSaving ? null : () => _uploadDocument(doc),
              child: busy
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(assetId == null ? 'Tải lên' : 'Thay tệp'),
            ),
          ],
        ),
      );
    }

    return _card(
      icon: Icons.folder_open_outlined,
      title: 'Tài liệu hồ sơ',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          row(PassportDocument.cv, passport.cvAssetId),
          if (passport.cvFile != null)
            Padding(padding: const EdgeInsets.only(bottom: 8), child: FileLinkTile(file: passport.cvFile!, refresh: vm.freshCvLink)),
          row(PassportDocument.avatar, passport.avatarAssetId),
          const Text(
            'Tệp được lưu riêng tư, tối đa 5 MB và được quét trước khi dùng.',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _buildAccountSection() {
    return _card(
      icon: Icons.manage_accounts_outlined,
      title: 'Tài khoản',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _buildLogoutButton(),
          if (widget.onDeleteAccount != null)
            TextButton(
              key: const Key('delete_account_button'),
              onPressed: _loggingOut ? null : _confirmDeleteAccount,
              style: TextButton.styleFrom(foregroundColor: AppColors.error),
              child: const Text('Xoá tài khoản'),
            ),
        ],
      ),
    );
  }

  Widget _buildLogoutButton() {
    return OutlinedButton.icon(
      key: const Key('logout_button'),
      onPressed: _loggingOut ? null : _confirmLogout,
      icon: _loggingOut
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.logout_rounded, size: 18),
      label: const Text('Đăng xuất'),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.error,
        backgroundColor: AppColors.surface,
        side: BorderSide(color: AppColors.error.withValues(alpha: 0.4)),
        minimumSize: const Size.fromHeight(44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    );
  }
}

/// F40 / FR-AUTH-08: re-enter the password, choose what happens to submitted snapshots, confirm.
class _DeleteAccountDialog extends StatefulWidget {
  final Future<String?> Function(String currentPassword, {required bool purgeSnapshots}) onDelete;

  const _DeleteAccountDialog({required this.onDelete});

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final TextEditingController _password = TextEditingController();
  bool _purge = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_password.text.isEmpty) {
      setState(() => _error = 'Nhập mật khẩu hiện tại để xác nhận.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final String? error = await widget.onDelete(_password.text, purgeSnapshots: _purge);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _busy = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Xoá tài khoản?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'Tài khoản bị khoá ngay, mọi phiên đăng nhập bị thu hồi và dữ liệu cá nhân được xoá sau 30 ngày. '
              'Không thể hoàn tác.',
              style: TextStyle(height: 1.4),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('delete_account_password'),
              controller: _password,
              obscureText: true,
              enabled: !_busy,
              decoration: const InputDecoration(labelText: 'Mật khẩu hiện tại'),
            ),
            CheckboxListTile(
              key: const Key('delete_account_purge'),
              contentPadding: EdgeInsets.zero,
              value: _purge,
              onChanged: _busy ? null : (bool? v) => setState(() => _purge = v ?? false),
              title: const Text('Xoá cả bản hồ sơ đã nộp', style: TextStyle(fontSize: 14)),
              subtitle: const Text(
                'Nếu không chọn, bản đã nộp được giữ theo chính sách lưu trữ để đơn vị tổ chức xét duyệt.',
                style: TextStyle(fontSize: 12),
              ),
            ),
            if (_error != null)
              Text(_error!, key: const Key('delete_account_error'), style: const TextStyle(color: AppColors.error)),
          ],
        ),
      ),
      actions: <Widget>[
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Huỷ')),
        TextButton(
          key: const Key('delete_account_confirm'),
          onPressed: _busy ? null : _submit,
          style: TextButton.styleFrom(foregroundColor: AppColors.error),
          child: _busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Xoá vĩnh viễn'),
        ),
      ],
    );
  }
}
