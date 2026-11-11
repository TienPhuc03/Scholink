import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../auth/widgets/auth_widgets.dart';
import 'application_model.dart';
import 'apply_viewmodel.dart';
import 'attachment_model.dart';
import 'widgets/application_widgets.dart';

/// F19 apply screen: one screen, three steps (Q7). The readiness step follows Figma frame
/// 162:915 ("Hoàn tất hồ sơ") and the success state frame 162:807 ("Nộp thành công!").
/// Owns and disposes its [ApplyViewModel].
class ApplyView extends StatefulWidget {
  final ApplyViewModel viewModel;

  /// Opens the Passport editor; the readiness check reruns when it returns.
  final Future<void> Function() onEditPassport;

  /// Opens an application's detail (already applied, or right after a successful submit).
  final void Function(String applicationId, {required bool justSubmitted}) onOpenApplication;

  const ApplyView({
    super.key,
    required this.viewModel,
    required this.onEditPassport,
    required this.onOpenApplication,
  });

  @override
  State<ApplyView> createState() => _ApplyViewState();
}

class _ApplyViewState extends State<ApplyView> {
  ApplyViewModel get vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    vm.addListener(_onChange);
    WidgetsBinding.instance.addPostFrameCallback((_) => vm.start());
  }

  @override
  void dispose() {
    vm.removeListener(_onChange);
    vm.dispose();
    super.dispose();
  }

  void _onChange() {
    if (!mounted) return;
    setState(() {}); // keeps PopScope.canPop in sync with `submitting`
  }

  Future<void> _editPassport() async {
    await widget.onEditPassport();
    if (mounted) await vm.checkReadiness();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: !vm.submitting,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text(
                'Nộp hồ sơ',
                style: TextStyle(
                    fontFamily: 'Be Vietnam Pro',
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary),
              ),
              Text(
                vm.opportunityTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textSecondary),
              ),
            ],
          ),
          shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
        ),
        body: ListenableBuilder(
          listenable: vm,
          builder: (BuildContext context, Widget? child) {
            if (vm.isLoading) return const Center(child: CircularProgressIndicator());
            if (vm.result != null) return _buildSuccess(vm.result!);
            if (vm.existingApplication != null) return _buildAlreadyApplied(vm.existingApplication!);
            return Column(
              children: <Widget>[
                _StepHeader(step: vm.step),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    children: <Widget>[
                      if (vm.resubmitRevision != null) ...<Widget>[
                        AuthMessageBanner(
                          key: const Key('apply_resubmit_banner'),
                          message: 'Bạn đang nộp lại hồ sơ đã rút. Đây sẽ là lần nộp thứ ${vm.resubmitRevision}; '
                              'các lần nộp trước vẫn được lưu nguyên.',
                          tone: AuthBannerTone.info,
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (vm.terminalError != null) ...<Widget>[
                        AuthMessageBanner(message: vm.terminalError!),
                        const SizedBox(height: 16),
                      ],
                      if (vm.hasUnconfirmedAttempt && !vm.canRetrySubmit) ...<Widget>[
                        _buildUnconfirmedBanner(),
                        const SizedBox(height: 16),
                      ],
                      ...switch (vm.step) {
                        ApplyStep.readiness => _buildReadiness(),
                        ApplyStep.attachments => _buildAttachments(),
                        ApplyStep.review => _buildReview(),
                      },
                    ],
                  ),
                ),
                _buildBottomBar(),
              ],
            );
          },
        ),
      ),
    );
  }

  // ---------------- Submitted (Q11, Figma 162:807) ----------------

  Widget _buildSuccess(SubmitResult r) {
    const TextStyle stepTitle =
        TextStyle(fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary);
    const TextStyle meta = TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary);
    final String shortId =
        r.applicationId.length <= 12 ? r.applicationId : r.applicationId.substring(r.applicationId.length - 8);
    return ListView(
      key: const Key('apply_success'),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: <Widget>[
        Stack(
          children: <Widget>[
            const Positioned.fill(child: _Confetti()),
            Center(
              child: Column(
                children: <Widget>[
                  Container(
                    width: 72,
                    height: 72,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: const Color(0x1A3525CD), borderRadius: BorderRadius.circular(8)),
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: const Color(0xFFE2DFFF),
                        borderRadius: BorderRadius.circular(6),
                        boxShadow: cardShadow,
                      ),
                      child: const Icon(Icons.check_rounded, size: 32, color: AppColors.primary),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(4)),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        CircleAvatar(radius: 3, backgroundColor: Color(0xFF005338)),
                        SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            'ĐÃ HOÀN TẤT NỘP HỒ SƠ',
                            style: TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.55,
                                color: AppColors.textSecondary),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Nộp thành công!',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'Be Vietnam Pro',
                      fontSize: 24,
                      height: 32 / 24,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.36,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text('#$shortId', textAlign: TextAlign.center, style: stepTitle),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(6),
            boxShadow: cardShadow,
          ),
          child: Row(
            children: <Widget>[
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: AppColors.primaryLight, borderRadius: BorderRadius.circular(4)),
                child: const Icon(Icons.emoji_events_outlined, color: AppColors.primary),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'LẦN NỘP ${r.revision > 0 ? r.revision : 1}',
                      style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.55,
                          color: AppColors.primary),
                    ),
                    Text(
                      vm.opportunityTitle,
                      style: const TextStyle(
                        fontFamily: 'Be Vietnam Pro',
                        fontSize: 18,
                        height: 24 / 18,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text('Kết quả sàng lọc: ${r.screening.label}', style: meta),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        SectionCard(
          title: 'Trình tự tiếp theo',
          trailing: const SmallBadge('3 giai đoạn', color: AppColors.textSecondary, background: AppColors.borderLight),
          child: Column(
            children: <Widget>[
              const _NextStep(
                color: Color(0xFF005338),
                icon: Icons.check_rounded,
                title: Text('Đã nhận hồ sơ', style: stepTitle),
                trailing: Text('Vừa xong', style: meta),
              ),
              _NextStep(
                color: AppColors.primary,
                icon: Icons.sync_rounded,
                title: Text('Đơn vị tổ chức xét duyệt', style: stepTitle.copyWith(color: AppColors.primary)),
                trailing: const SmallBadge('Đang xử lý', color: Color(0xFFDC2C4F), background: Color(0x80FFDADB)),
              ),
              const _NextStep(
                color: Color(0xFFDAE2FD),
                iconColor: AppColors.textSecondary,
                icon: Icons.schedule,
                title: Text('Thông báo kết quả', style: stepTitle),
                trailing: Text('Sắp tới', style: meta),
                last: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.cardInfoBackground, borderRadius: BorderRadius.circular(6)),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: const Color(0x1A3525CD), borderRadius: BorderRadius.circular(4)),
                child: const Icon(Icons.lightbulb_outline, size: 18, color: AppColors.primary),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text.rich(
                  TextSpan(
                    text: 'Gợi ý:',
                    style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                    children: <InlineSpan>[
                      TextSpan(
                        text: ' Theo dõi trạng thái trong ',
                        style: TextStyle(fontWeight: FontWeight.w400, color: AppColors.textSecondary),
                      ),
                      TextSpan(text: 'Đơn Ứng Tuyển', style: TextStyle(color: AppColors.primary)),
                      TextSpan(
                        text: ' ở tab Passport.',
                        style: TextStyle(fontWeight: FontWeight.w400, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                  style: TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, height: 16 / 12),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        AuthPrimaryButton(
          key: const Key('apply_success_view'),
          label: 'Xem trạng thái',
          icon: Icons.assignment_turned_in_outlined,
          onPressed: () => widget.onOpenApplication(r.applicationId, justSubmitted: true),
        ),
        const SizedBox(height: 8),
        TextButton.icon(
          key: const Key('apply_success_home'),
          onPressed: () => Navigator.of(context).popUntil((Route<dynamic> route) => route.isFirst),
          icon: const Icon(Icons.home_outlined, size: 18),
          label: const Text('Về trang chủ'),
          style: TextButton.styleFrom(
            foregroundColor: AppColors.textPrimary,
            backgroundColor: AppColors.primaryLight,
            minimumSize: const Size.fromHeight(48),
            textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
          ),
        ),
      ],
    );
  }

  // ---------------- Already applied (Q15) ----------------

  Widget _buildAlreadyApplied(ApplicationSummary app) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        const SizedBox(height: 24),
        const Icon(Icons.task_alt_rounded, size: 56, color: AppColors.success),
        const SizedBox(height: 12),
        const Text(
          'Bạn đã nộp hồ sơ cho cơ hội này',
          textAlign: TextAlign.center,
          style: TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 18, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          'Nộp lúc ${formatDateTime(app.submittedAt)} · lần ${app.revision}',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 8),
        Center(child: StatusPill(app.status)),
        if (vm.submitError != null) ...<Widget>[
          const SizedBox(height: 16),
          AuthMessageBanner(message: vm.submitError!, tone: AuthBannerTone.info),
        ],
        const SizedBox(height: 24),
        AuthPrimaryButton(
          key: const Key('apply_view_existing'),
          label: 'Xem hồ sơ',
          icon: Icons.visibility_outlined,
          onPressed: () => widget.onOpenApplication(app.id, justSubmitted: false),
        ),
      ],
    );
  }

  Widget _buildUnconfirmedBanner() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const Text(
            'Lần nộp trước cho cơ hội này chưa nhận được xác nhận (có thể do mất mạng hoặc ứng dụng bị đóng).',
            style: TextStyle(fontSize: 13, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const Key('apply_resume'),
            onPressed: vm.submitting ? null : vm.retrySubmit,
            icon: const Icon(Icons.sync_rounded, size: 18),
            label: const Text('Kiểm tra và gửi lại lần nộp đó'),
          ),
        ],
      ),
    );
  }

  // ---------------- Step 1: readiness ----------------

  List<Widget> _buildReadiness() {
    final ReadinessResult? r = vm.readiness;
    if (vm.checkingReadiness && r == null) {
      return const <Widget>[Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))];
    }
    return <Widget>[
      if (vm.readinessError != null) ...<Widget>[
        AuthMessageBanner(message: vm.readinessError!),
        const SizedBox(height: 12),
      ],
      if (r != null)
        SectionCard(
          title: 'Hoàn tất hồ sơ',
          trailing: ScreeningPill(r.screening),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  const Expanded(
                    child: Text(
                      'Tiến độ',
                      style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.44,
                          color: AppColors.textSecondary),
                    ),
                  ),
                  Text(
                    '${r.readinessScore}%',
                    style: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.44,
                        color: AppColors.primary),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: r.readinessScore / 100,
                  minHeight: 6,
                  backgroundColor: AppColors.borderLight,
                  valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primary),
                ),
              ),
              const SizedBox(height: 12),
              for (final String f in r.missingFields) ...<Widget>[
                _ChecklistRow(field: f, onFix: _editPassport),
                const SizedBox(height: 4),
              ],
              if (r.missingFields.isEmpty) const _ChecklistRow(field: null),
              if (r.reasons.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                ReasonList(r.reasons),
              ],
              const SizedBox(height: 12),
              if (r.screening == Screening.ineligible)
                const AuthMessageBanner(message: 'Hồ sơ chưa đáp ứng điều kiện của cơ hội này nên chưa thể nộp.')
              else if (r.missingFields.isNotEmpty)
                const AuthMessageBanner(message: 'Hãy bổ sung các mục còn thiếu trong Passport rồi kiểm tra lại.')
              else if (r.screening == Screening.needsReview)
                const AuthMessageBanner(
                  message: 'Bạn vẫn có thể nộp. Hồ sơ sẽ được đơn vị tổ chức xem xét thủ công.',
                  tone: AuthBannerTone.info,
                )
              else
                const AuthMessageBanner(message: 'Hồ sơ sẵn sàng để nộp.', tone: AuthBannerTone.success),
            ],
          ),
        ),
      const SizedBox(height: 12),
      Row(
        children: <Widget>[
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _editPassport,
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Cập nhật Passport'),
              style: _outlined(),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: vm.checkingReadiness ? null : vm.checkReadiness,
              icon: vm.checkingReadiness
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Kiểm tra lại'),
              style: _outlined(),
            ),
          ),
        ],
      ),
    ];
  }

  // ---------------- Step 2: attachments ----------------

  List<Widget> _buildAttachments() {
    final int active = vm.attachments.where((AttachmentItem a) => a.state != AttachmentState.rejected).length;
    return <Widget>[
      SectionCard(
        icon: Icons.attach_file_rounded,
        title: 'Tệp đính kèm (không bắt buộc)',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const Text(
              'Chỉ nhận PDF · tối đa 5 MB mỗi tệp · tối đa ${AttachmentRules.maxFiles} tệp.',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
            const SizedBox(height: 12),
            for (final AttachmentItem a in vm.attachments) ...<Widget>[
              _AttachmentRow(item: a, onRemove: () => vm.removeAttachment(a.localId)),
              const SizedBox(height: 8),
            ],
            if (vm.attachmentError != null) ...<Widget>[
              AuthMessageBanner(message: vm.attachmentError!),
              const SizedBox(height: 8),
            ],
            OutlinedButton.icon(
              key: const Key('apply_add_file'),
              onPressed: active >= AttachmentRules.maxFiles ? null : vm.pickAttachment,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text('Thêm tệp ($active/${AttachmentRules.maxFiles})'),
              style: _outlined(),
            ),
          ],
        ),
      ),
    ];
  }

  // ---------------- Step 3: preview, consent ----------------

  List<Widget> _buildReview() {
    final ApplicationPreview? p = vm.preview;
    if (vm.creatingPreview) {
      return const <Widget>[
        Padding(
          padding: EdgeInsets.all(32),
          child: Column(children: <Widget>[
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text('Đang tạo bản xem trước...'),
          ]),
        ),
      ];
    }

    final List<Widget> out = <Widget>[];
    if (vm.previewError != null) {
      out
        ..add(AuthMessageBanner(message: vm.previewError!))
        ..add(const SizedBox(height: 12));
    }
    if (vm.needsNewPreview) {
      out
        ..add(AuthMessageBanner(
          message: p == null
              ? 'Chưa có bản xem trước.'
              : vm.previewStale
                  ? 'Bản xem trước không còn khớp với dữ liệu mới nhất.'
                  : 'Bản xem trước đã hết hạn (10 phút).',
          tone: AuthBannerTone.info,
        ))
        ..add(const SizedBox(height: 12))
        ..add(AuthPrimaryButton(
          key: const Key('apply_new_preview'),
          label: 'Tạo lại bản xem trước',
          icon: Icons.refresh_rounded,
          onPressed: vm.createPreview,
        ));
      if (p == null) return out;
      out.add(const SizedBox(height: 16));
    }
    if (p == null) return out;

    out.addAll(<Widget>[
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.cardInfoBackground,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          children: <Widget>[
            const Icon(Icons.timer_outlined, size: 18, color: AppColors.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                vm.previewExpired ? 'Bản xem trước đã hết hạn' : 'Bản xem trước còn hiệu lực',
                style: const TextStyle(fontSize: 13),
              ),
            ),
            Text(
              formatCountdown(vm.previewSecondsLeft),
              key: const Key('apply_countdown'),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.primary),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      SectionCard(
        icon: Icons.badge_outlined,
        title: 'Hồ sơ sẽ được gửi',
        trailing: ScreeningPill(p.screening),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            PassportSnapshotFields(p.snapshot),
            if (p.reasons.isNotEmpty) ...<Widget>[const SizedBox(height: 8), ReasonList(p.reasons)],
          ],
        ),
      ),
      const SizedBox(height: 12),
      SectionCard(
        icon: Icons.attach_file_rounded,
        title: 'Tệp đính kèm (${p.attachmentIds.length})',
        child: p.attachmentIds.isEmpty
            ? const Text('Không có tệp đính kèm.', style: TextStyle(fontSize: 13, color: AppColors.textMuted))
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: p.attachmentIds.map((String id) {
                  final AttachmentItem? local =
                      vm.attachments.where((AttachmentItem a) => a.assetId == id).firstOrNull;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('• ${local?.fileName ?? id}', style: const TextStyle(fontSize: 13)),
                  );
                }).toList(),
              ),
      ),
      const SizedBox(height: 12),
      Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: const Text('Chi tiết kỹ thuật', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          children: <Widget>[
            _kv('Mã bản xem trước', p.previewId),
            _kv('Mã snapshot', p.snapshotId),
            _kv('Phiên bản hồ sơ / quy tắc', 'v${p.profileVersion} / v${p.ruleVersion}'),
            _kv('Mã băm nội dung', p.payloadHash),
          ],
        ),
      ),
      const SizedBox(height: 4),
      _buildConsent(p),
      if (vm.submitError != null) ...<Widget>[
        const SizedBox(height: 12),
        AuthMessageBanner(message: vm.submitError!),
      ],
      if (vm.canRetrySubmit) ...<Widget>[
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('apply_retry'),
          onPressed: vm.submitting ? null : vm.retrySubmit,
          icon: const Icon(Icons.replay_rounded, size: 18),
          label: const Text('Thử lại'),
          style: _outlined(),
        ),
      ],
    ]);
    return out;
  }

  Widget _buildConsent(ApplicationPreview p) {
    final String files = p.attachmentIds.isEmpty ? '' : ' và ${p.attachmentIds.length} tệp đính kèm';
    final bool enabled = !vm.needsNewPreview && !vm.submitting;
    return InkWell(
      onTap: enabled ? () => vm.setConsent(!vm.consentAccepted) : null,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SizedBox(
              width: 20,
              height: 20,
              child: Checkbox(
                key: const Key('apply_consent'),
                value: vm.consentAccepted,
                onChanged: enabled ? (bool? v) => vm.setConsent(v ?? false) : null,
                activeColor: AppColors.primary,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Tôi đồng ý chia sẻ bản hồ sơ trên$files cho đơn vị tổ chức để xét tuyển '
                '"${vm.opportunityTitle}". Bản đã nộp không thay đổi khi tôi cập nhật Passport sau này.',
                style: const TextStyle(fontSize: 13, height: 1.4, color: AppColors.textPrimary),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---------------- Bottom bar ----------------

  Widget _buildBottomBar() {
    final Widget? back = vm.step == ApplyStep.readiness
        ? null
        : OutlinedButton(
            onPressed: vm.submitting ? null : vm.back,
            style: _outlined().copyWith(minimumSize: const WidgetStatePropertyAll<Size>(Size(0, 48))),
            child: const Text('Quay lại'),
          );
    final Widget primary = switch (vm.step) {
      ApplyStep.readiness => AuthPrimaryButton(
          key: const Key('apply_next_1'),
          label: 'Tiếp tục',
          icon: vm.readiness?.canProceed == true ? Icons.arrow_forward_rounded : Icons.lock_outline_rounded,
          onPressed: vm.readiness?.canProceed == true && vm.terminalError == null ? vm.goToAttachments : null,
        ),
      ApplyStep.attachments => AuthPrimaryButton(
          key: const Key('apply_next_2'),
          label: vm.attachments.isEmpty ? 'Bỏ qua, xem trước' : 'Xem trước hồ sơ',
          onPressed: vm.isUploading ? null : vm.goToReview,
        ),
      ApplyStep.review => AuthPrimaryButton(
          key: const Key('apply_submit'),
          label: 'Nộp hồ sơ',
          icon: Icons.send_rounded,
          isLoading: vm.submitting,
          onPressed: vm.canSubmit ? vm.submit : null,
        ),
    };
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.borderLight)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: <Widget>[
            if (back != null) ...<Widget>[back, const SizedBox(width: 12)],
            Expanded(child: primary),
          ],
        ),
      ),
    );
  }

  ButtonStyle _outlined() => OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        backgroundColor: AppColors.surface,
        side: const BorderSide(color: AppColors.border),
        minimumSize: const Size.fromHeight(44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      );

  Widget _kv(String k, String v) => KeyValueRow(k, v);
}

class _StepHeader extends StatelessWidget {
  final ApplyStep step;

  const _StepHeader({required this.step});

  @override
  Widget build(BuildContext context) {
    const List<String> labels = <String>['Kiểm tra', 'Tệp đính kèm', 'Xem trước & nộp'];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.borderLight))),
      // F37 (Q7): each step takes a third of the width and its label wraps, so large
      // system text never pushes the header off screen.
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: List<Widget>.generate(labels.length * 2 - 1, (int i) {
          if (i.isOdd) {
            return Container(
              width: 16,
              height: 2,
              margin: const EdgeInsets.only(top: 12),
              color: i ~/ 2 < step.index ? AppColors.primary : AppColors.border,
            );
          }
          final int idx = i ~/ 2;
          final bool done = idx < step.index;
          final bool current = idx == step.index;
          return Expanded(
            child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              CircleAvatar(
                radius: 13,
                backgroundColor: done || current ? AppColors.primary : AppColors.borderLight,
                child: done
                    ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
                    : Text('${idx + 1}',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: current ? Colors.white : AppColors.textSecondary)),
              ),
              const SizedBox(height: 4),
              Text(labels[idx],
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: current ? FontWeight.w600 : FontWeight.w400,
                      color: current ? AppColors.primary : AppColors.textSecondary)),
            ],
            ),
          );
        }),
      ),
    );
  }
}

class _AttachmentRow extends StatelessWidget {
  final AttachmentItem item;
  final VoidCallback onRemove;

  const _AttachmentRow({required this.item, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final bool isPdf = item.fileName.toLowerCase().endsWith('.pdf');
    return Container(
      padding: const EdgeInsets.only(left: 12, top: 8, bottom: 8),
      decoration: BoxDecoration(
        color: item.state == AttachmentState.rejected
            ? AppColors.error.withValues(alpha: 0.06)
            : AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: <Widget>[
          Icon(isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(item.fileName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14)),
                const SizedBox(height: 2),
                Row(
                  children: <Widget>[
                    Text(item.sizeLabel, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                    const SizedBox(width: 8),
                    switch (item.state) {
                      AttachmentState.uploading => const Pill(text: 'Đang tải lên', color: AppColors.primary),
                      AttachmentState.ready =>
                        const Pill(text: 'Sẵn sàng', color: AppColors.success, icon: Icons.check_rounded),
                      AttachmentState.rejected => const Pill(text: 'Bị từ chối', color: AppColors.error),
                    },
                  ],
                ),
                if (item.error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4, right: 8),
                    child: Text(item.error!, style: const TextStyle(fontSize: 12, color: AppColors.error)),
                  ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Xóa tệp',
            onPressed: onRemove,
            icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

/// One row of the "Missing Fields List" (frame 162:915); `field == null` is the completed row.
class _ChecklistRow extends StatelessWidget {
  final String? field;
  final VoidCallback? onFix;

  const _ChecklistRow({required this.field, this.onFix});

  @override
  Widget build(BuildContext context) {
    final bool done = field == null;
    final String key = (field ?? '').toLowerCase();
    final (IconData icon, String action) = switch (key) {
      _ when key.contains('cv') => (Icons.description_outlined, 'Tải lên'),
      _ when key.contains('gpa') || key.contains('education') => (Icons.school_outlined, 'Điền'),
      _ when key.contains('skill') => (Icons.psychology_outlined, 'Chọn'),
      _ => (Icons.badge_outlined, 'Bổ sung'),
    };
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: done ? AppColors.surface : AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(6),
        boxShadow: done ? cardShadow : null,
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: done ? const Color(0xFF6FFBBE) : const Color(0xFFE2DFFF),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Icon(done ? Icons.badge_outlined : icon,
                size: 18, color: done ? const Color(0xFF005338) : AppColors.primary),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              done ? 'Passport đã đủ các mục bắt buộc' : missingFieldLabel(field!),
              style: const TextStyle(
                  fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            ),
          ),
          const SizedBox(width: 8),
          if (done)
            const Icon(Icons.check_rounded, size: 20, color: Color(0xFF005338))
          else
            Material(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(4),
              elevation: 0.5,
              child: InkWell(
                borderRadius: BorderRadius.circular(4),
                onTap: onFix,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Text(
                    action,
                    style: const TextStyle(
                        fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// One line of "Trình tự tiếp theo" on the success screen.
class _NextStep extends StatelessWidget {
  final Color color;
  final Color iconColor;
  final IconData icon;
  final Widget title;
  final Widget trailing;
  final bool last;

  const _NextStep({
    required this.color,
    required this.icon,
    required this.title,
    required this.trailing,
    this.iconColor = Colors.white,
    this.last = false,
  });

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Column(
            children: <Widget>[
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4)),
                child: Icon(icon, size: 12, color: iconColor),
              ),
              if (!last) Expanded(child: Container(width: 2, color: AppColors.primaryLight)),
            ],
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 16),
              child: SizedBox(
                width: double.infinity,
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  children: <Widget>[title, trailing],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Geometric Minimal Confetti Accents" of frame 162:807: decorative only.
class _Confetti extends StatelessWidget {
  const _Confetti();

  static Widget _bit(Color color, double w, double h, double turns, {double radius = 1}) => Transform.rotate(
        angle: turns * 6.283185307179586,
        child: Container(
          width: w,
          height: h,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(radius)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: ExcludeSemantics(
        child: Opacity(
          opacity: 0.4,
          child: Stack(
            children: <Widget>[
              Positioned(left: 24, top: 8, child: _bit(const Color(0x663525CD), 8, 8, 1 / 30, radius: 2)),
              Positioned(right: 40, top: 30, child: _bit(const Color(0x66005338), 10, 6, -1 / 8)),
              Positioned(left: 45, top: 64, child: _bit(const Color(0x66DC2C4F), 6, 12, 1 / 8)),
              Positioned(left: 110, top: 24, child: _bit(const Color(0x4D3525CD), 6, 6, 0, radius: 3)),
              Positioned(right: 90, top: 56, child: _bit(const Color(0x4D006E4B), 8, 8, 1 / 30, radius: 2)),
            ],
          ),
        ),
      ),
    );
  }
}
