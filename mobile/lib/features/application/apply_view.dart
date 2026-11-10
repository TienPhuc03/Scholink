import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../auth/widgets/auth_widgets.dart';
import 'application_model.dart';
import 'apply_viewmodel.dart';
import 'attachment_model.dart';
import 'widgets/application_widgets.dart';

/// F19 apply screen: one screen, three steps (Q7). No Figma frame exists, so it reuses the
/// auth/Passport styles. Owns and disposes its [ApplyViewModel].
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
  bool _handedOff = false;

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

  /// Q11: after a successful submit, replace this flow with the application detail.
  void _onChange() {
    if (!mounted) return;
    setState(() {}); // keeps PopScope.canPop in sync with `submitting`
    final SubmitResult? r = vm.result;
    if (r != null && !_handedOff && mounted) {
      _handedOff = true;
      widget.onOpenApplication(r.applicationId, justSubmitted: true);
    }
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
              const Text('Nộp hồ sơ'),
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
          icon: Icons.fact_check_outlined,
          title: 'Kiểm tra điều kiện',
          trailing: ScreeningPill(r.screening),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  const Expanded(child: Text('Mức sẵn sàng của hồ sơ', style: TextStyle(fontSize: 14))),
                  Text('${r.readinessScore}%',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primary)),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: r.readinessScore / 100,
                  minHeight: 8,
                  backgroundColor: AppColors.border,
                  valueColor: AlwaysStoppedAnimation<Color>(screeningColor(r.screening)),
                ),
              ),
              if (r.reasons.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                ReasonList(r.reasons),
              ],
              if (r.missingFields.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                const Text('Passport còn thiếu:',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.error)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: r.missingFields
                      .map((String f) => Pill(text: missingFieldLabel(f), color: AppColors.error))
                      .toList(),
                ),
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
