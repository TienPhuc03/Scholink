import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../auth/widgets/auth_widgets.dart';
import 'application_model.dart';
import 'my_applications_viewmodel.dart';
import 'widgets/application_widgets.dart';

/// Application detail: status, timeline, submitted revisions, and the withdraw / resubmit
/// actions the backend allows for this viewer (F19 read-only part, F28 actions).
class ApplicationDetailView extends StatefulWidget {
  final ApplicationDetailViewModel viewModel;
  final bool justSubmitted;

  /// Opens the F19 apply flow for this opportunity; it becomes the next revision (Q4).
  final void Function(ApplicationDetail detail)? onResubmit;

  /// Opens the read-only snapshot of one submitted revision (Q5).
  final void Function(ApplicationDetail detail, ApplicationRevision revision)? onOpenRevision;

  const ApplicationDetailView({
    super.key,
    required this.viewModel,
    this.justSubmitted = false,
    this.onResubmit,
    this.onOpenRevision,
  });

  @override
  State<ApplicationDetailView> createState() => _ApplicationDetailViewState();
}

class _ApplicationDetailViewState extends State<ApplicationDetailView> {
  ApplicationDetailViewModel get vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => vm.load());
  }

  @override
  void dispose() {
    vm.dispose();
    super.dispose();
  }

  Future<void> _confirmWithdraw(ApplicationDetail d) async {
    final DateTime? deadline = d.registrationDeadline;
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Rút hồ sơ?'),
        content: Text(
          'Hồ sơ sẽ chuyển sang trạng thái "Đã rút" và đơn vị tổ chức không xét hồ sơ này nữa.\n\n'
          '${deadline != null ? 'Bạn có thể nộp lại trước ${formatDateTime(deadline)}. ' : 'Bạn có thể nộp lại khi cơ hội còn hạn. '}'
          'Lần nộp lại sẽ là lần ${d.summary.revision + 1}; bản đã nộp trước đó vẫn được lưu nguyên.',
          style: const TextStyle(height: 1.4),
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Giữ hồ sơ')),
          TextButton(
            key: const Key('detail_withdraw_confirm'),
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Rút hồ sơ'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final String? error = await vm.withdraw();
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(error ?? 'Đã rút hồ sơ. Bạn có thể nộp lại trước khi hết hạn đăng ký.'),
        backgroundColor: error == null ? AppColors.success : AppColors.error,
      ));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: vm,
      builder: (BuildContext context, Widget? child) {
        final ApplicationDetail? d = vm.detail;
        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            title: const Text('Chi tiết hồ sơ'),
            shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
          ),
          bottomNavigationBar: d == null ? null : _buildActionBar(d),
          body: _buildBody(d),
        );
      },
    );
  }

  Widget _buildBody(ApplicationDetail? d) {
    if (vm.isLoading && d == null) return const Center(child: CircularProgressIndicator());
    if (d == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(vm.errorMessage ?? 'Không tải được hồ sơ.', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: vm.load, child: const Text('Thử lại')),
            ],
          ),
        ),
      );
    }
    final ApplicationSummary s = d.summary;
    return RefreshIndicator(
      onRefresh: vm.load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          if (widget.justSubmitted) ...<Widget>[
            const AuthMessageBanner(
              message: 'Nộp hồ sơ thành công! Bạn có thể theo dõi trạng thái tại đây '
                  'hoặc trong "Hồ sơ ứng tuyển của tôi" ở tab Passport.',
              tone: AuthBannerTone.success,
            ),
            const SizedBox(height: 12),
          ],
          SectionCard(
            icon: Icons.description_outlined,
            title: s.displayTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: <Widget>[
                    StatusPill(s.status),
                    ScreeningPill(s.screening),
                    if (s.typeLabel.isNotEmpty) Pill(text: s.typeLabel, color: AppColors.primary),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  '${s.isTeam ? 'Nộp theo đội' : 'Nộp cá nhân'} · lần ${s.revision} · ${formatDateTime(s.submittedAt)}',
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
                if (d.registrationDeadline != null) ...<Widget>[
                  const SizedBox(height: 4),
                  Text(
                    'Hạn đăng ký: ${formatDateTime(d.registrationDeadline)}',
                    style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                  ),
                ],
                if (d.reasons.isNotEmpty) ...<Widget>[const SizedBox(height: 10), ReasonList(d.reasons)],
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            icon: Icons.timeline_rounded,
            title: 'Tiến trình',
            child: d.events.isEmpty
                ? Text('Đã nộp lúc ${formatDateTime(s.submittedAt)}.', style: const TextStyle(fontSize: 13))
                : Column(
                    children: List<Widget>.generate(d.events.length, (int i) {
                      final ApplicationEvent e = d.events[i];
                      final ApplicationRevision? rev = e.isSubmission ? d.revisionNumber(e.revision) : null;
                      return _TimelineEntry(
                        event: e,
                        isLast: i == d.events.length - 1,
                        onOpenRevision: rev == null || widget.onOpenRevision == null
                            ? null
                            : () => widget.onOpenRevision!(d, rev),
                      );
                    }),
                  ),
          ),
          if (d.revisions.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            SectionCard(
              icon: Icons.history_rounded,
              title: 'Các lần nộp',
              child: Column(
                children: <Widget>[
                  for (int i = 0; i < d.revisions.length; i++)
                    _RevisionTile(
                      revision: d.revisions[i],
                      isCurrent: i == 0,
                      onTap: widget.onOpenRevision == null ? null : () => widget.onOpenRevision!(d, d.revisions[i]),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Chi tiết kỹ thuật', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                SelectableText('Mã hồ sơ: ${s.id}', style: const TextStyle(fontSize: 12)),
                SelectableText('Mã snapshot: ${d.snapshotId}', style: const TextStyle(fontSize: 12)),
                SelectableText('Mã đồng ý: ${d.consentId}', style: const TextStyle(fontSize: 12)),
                SelectableText('Hồ sơ v${d.profileVersion} · quy tắc v${d.ruleVersion}',
                    style: const TextStyle(fontSize: 12)),
                SelectableText('Mã băm: ${d.payloadHash}', style: const TextStyle(fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Q13: one sticky bar with the action the backend allows, or why there is none.
  Widget? _buildActionBar(ApplicationDetail d) {
    final ApplicationSummary s = d.summary;
    Widget? content;
    if (d.canWithdraw) {
      content = OutlinedButton.icon(
        key: const Key('detail_withdraw'),
        onPressed: vm.isWithdrawing ? null : () => _confirmWithdraw(d),
        icon: vm.isWithdrawing
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.undo_rounded, size: 18),
        label: const Text('Rút hồ sơ'),
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.error,
          backgroundColor: AppColors.surface,
          side: const BorderSide(color: AppColors.error),
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
        ),
      );
    } else if (d.canResubmit && !s.isTeam) {
      content = AuthPrimaryButton(
        key: const Key('detail_resubmit'),
        label: 'Nộp lại (lần ${s.revision + 1})',
        icon: Icons.send_rounded,
        onPressed: widget.onResubmit == null ? null : () => widget.onResubmit!(d),
      );
    } else {
      final String? note = _actionNote(d);
      if (note != null) {
        content = Row(
          children: <Widget>[
            const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.textSecondary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(note,
                  key: const Key('detail_action_note'),
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ),
          ],
        );
      }
    }
    if (content == null) return null;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.borderLight)),
      ),
      child: SafeArea(top: false, child: content),
    );
  }

  String? _actionNote(ApplicationDetail d) {
    final ApplicationSummary s = d.summary;
    if (s.isTeam && d.canResubmit) return 'Trưởng đội nộp lại hồ sơ từ màn đội thi.';
    if (s.isTeam && !d.viewerIsOwner && !d.isClosedOutcome && s.status != ApplicationStatus.withdrawn) {
      return 'Chỉ trưởng đội có thể rút hồ sơ của đội.';
    }
    if (d.isClosedOutcome) return 'Hồ sơ đã có kết quả nên không thể rút.';
    final DateTime? deadline = d.registrationDeadline;
    if (deadline != null && DateTime.now().isAfter(deadline)) {
      return 'Đã hết hạn đăng ký (${formatDateTime(deadline)}) nên không thể rút hay nộp lại.';
    }
    return null;
  }
}

class _RevisionTile extends StatelessWidget {
  final ApplicationRevision revision;
  final bool isCurrent;
  final VoidCallback? onTap;

  const _RevisionTile({required this.revision, required this.isCurrent, this.onTap});

  @override
  Widget build(BuildContext context) {
    final ApplicationRevision r = revision;
    return InkWell(
      key: Key('detail_revision_${r.revision}'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: <Widget>[
                      Text('Lần ${r.revision}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      if (isCurrent) const Pill(text: 'Hiện tại', color: AppColors.primary),
                      ScreeningPill(r.screening),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    <String>[
                      formatDateTime(r.submittedAt),
                      if (r.isRedacted) 'đã xoá theo chính sách lưu trữ' else '${r.attachmentCount} tệp đính kèm',
                    ].join(' · '),
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            if (onTap != null) const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}

class _TimelineEntry extends StatelessWidget {
  final ApplicationEvent event;
  final bool isLast;
  final VoidCallback? onOpenRevision;

  const _TimelineEntry({required this.event, required this.isLast, this.onOpenRevision});

  @override
  Widget build(BuildContext context) {
    final Color color = statusColor(event.toStatus);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SizedBox(
            width: 20,
            child: Column(
              children: <Widget>[
                Container(
                  margin: const EdgeInsets.only(top: 3),
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                ),
                if (!isLast) Expanded(child: Container(width: 2, color: AppColors.border)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(event.toStatus.label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color)),
                  Text(
                    <String>[
                      if (event.createdAt != null) formatDateTime(event.createdAt),
                      if (event.revision > 0) 'lần ${event.revision}',
                    ].join(' · '),
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                  if (event.reasonLabel != null)
                    Text(event.reasonLabel!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  if (onOpenRevision != null)
                    GestureDetector(
                      key: Key('timeline_open_revision_${event.revision}'),
                      onTap: onOpenRevision,
                      child: const Padding(
                        padding: EdgeInsets.only(top: 2),
                        child: Text(
                          'Xem bản đã nộp',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
