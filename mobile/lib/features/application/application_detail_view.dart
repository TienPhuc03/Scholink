import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/refresh_error_banner.dart';
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

  /// F37 (Q18): leader resubmits a withdrawn team application through the team flow.
  final void Function(ApplicationDetail detail)? onResubmitTeam;

  const ApplicationDetailView({
    super.key,
    required this.viewModel,
    this.justSubmitted = false,
    this.onResubmit,
    this.onOpenRevision,
    this.onResubmitTeam,
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
            title: const Text(
              'Chi Tiết Đơn',
              style: TextStyle(
                fontFamily: 'Be Vietnam Pro',
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
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
          if (vm.hasError) ...<Widget>[
            RefreshErrorBanner(message: vm.errorMessage, onRetry: vm.load),
            const SizedBox(height: 12),
          ],
          if (widget.justSubmitted) ...<Widget>[
            const AuthMessageBanner(
              message: 'Nộp hồ sơ thành công! Bạn có thể theo dõi trạng thái tại đây '
                  'hoặc trong "Hồ sơ ứng tuyển của tôi" ở tab Passport.',
              tone: AuthBannerTone.success,
            ),
            const SizedBox(height: 12),
          ],
          _HeroCard(detail: d),
          const SizedBox(height: 16),
          SectionCard(
            title: 'Tiến độ xử lý',
            trailing: d.events.isEmpty
                ? null
                : SmallBadge('${d.events.length} mốc',
                    color: AppColors.primary, background: const Color(0x66E2DFFF)),
            child: d.events.isEmpty
                ? Text('Đã nộp lúc ${formatDateTime(s.submittedAt)}.',
                    style: const TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary))
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
            const SizedBox(height: 16),
            _SnapshotCard(
              detail: d,
              onOpen: widget.onOpenRevision == null ? null : (ApplicationRevision r) => widget.onOpenRevision!(d, r),
            ),
          ],
          if (d.registrationDeadline != null && d.canWithdraw) ...<Widget>[
            const SizedBox(height: 16),
            InfoNote('Có thể rút đơn trước hạn đăng ký (${formatDateTime(d.registrationDeadline)}). '
                'Sau thời hạn này, hồ sơ được giữ nguyên để đơn vị tổ chức xét duyệt.'),
          ],
          const SizedBox(height: 8),
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
      content = TextButton.icon(
        key: const Key('detail_withdraw'),
        onPressed: vm.isWithdrawing ? null : () => _confirmWithdraw(d),
        icon: vm.isWithdrawing
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.cancel_outlined, size: 15),
        label: const Text('Rút đơn ứng tuyển'),
        style: TextButton.styleFrom(
          foregroundColor: _danger,
          backgroundColor: AppColors.surface,
          minimumSize: const Size.fromHeight(44),
          textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    } else if (d.canResubmit && s.isTeam && widget.onResubmitTeam != null) {
      content = AuthPrimaryButton(
        key: const Key('detail_resubmit_team'),
        label: 'Nộp lại cho đội (lần ${s.revision + 1})',
        icon: Icons.groups_outlined,
        onPressed: () => widget.onResubmitTeam!(d),
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
      if (note != null) content = InfoNote(note, textKey: const Key('detail_action_note'));
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

/// Red of the "Rút đơn" / "Yêu cầu bổ sung" elements in the Figma frames.
const Color _danger = Color(0xFFB90538);

String _shortTime(DateTime? d) {
  if (d == null) return '';
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
}

/// "Section - Status Hero Card" of frame 357:373.
class _HeroCard extends StatelessWidget {
  final ApplicationDetail detail;

  const _HeroCard({required this.detail});

  @override
  Widget build(BuildContext context) {
    final ApplicationSummary s = detail.summary;
    const TextStyle meta = TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary);
    const TextStyle tag = TextStyle(fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600);
    final Color screening = screeningColor(s.screening);
    final Color status = statusColor(s.status);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        boxShadow: cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 6,
            children: <Widget>[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: status.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(9999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(color: status, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      s.status.label,
                      style: TextStyle(fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: status),
                    ),
                  ],
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const Icon(Icons.schedule, size: 12, color: AppColors.textSecondary),
                  const SizedBox(width: 4),
                  Flexible(child: Text(formatDateTime(s.submittedAt).replaceFirst(' ', ' • '), style: meta)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            s.displayTitle,
            style: const TextStyle(
              fontFamily: 'Be Vietnam Pro',
              fontSize: 20,
              height: 28 / 20,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              if (s.typeLabel.isNotEmpty) ...<Widget>[
                Text(s.typeLabel, style: tag.copyWith(color: AppColors.primary)),
                Text('•', style: tag.copyWith(color: AppColors.border)),
              ],
              Icon(s.isTeam ? Icons.group_outlined : Icons.person_outline, size: 15, color: AppColors.textPrimary),
              Text(
                '${s.isTeam ? 'Nộp theo đội' : 'Nộp cá nhân'} · lần ${s.revision}',
                style: tag.copyWith(color: AppColors.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: tintBox,
            child: Row(
              children: <Widget>[
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(color: screening.withValues(alpha: 0.1), shape: BoxShape.circle),
                  child: Icon(Icons.verified_outlined, size: 15, color: screening),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'Kết quả sàng lọc',
                        style: TextStyle(
                            fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                      ),
                      Text(
                        detail.registrationDeadline != null
                            ? 'Hạn đăng ký: ${formatDateTime(detail.registrationDeadline)}'
                            : 'Theo quy tắc v${detail.ruleVersion}',
                        style: meta,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    s.screening.label,
                    textAlign: TextAlign.end,
                    style: TextStyle(
                        fontFamily: 'Be Vietnam Pro', fontSize: 14, fontWeight: FontWeight.w600, color: screening),
                  ),
                ),
              ],
            ),
          ),
          if (detail.reasons.isNotEmpty) ...<Widget>[const SizedBox(height: 10), ReasonList(detail.reasons)],
        ],
      ),
    );
  }
}

/// "Section - Application Snapshot Summary Card": integrity hash + one row per submitted revision.
class _SnapshotCard extends StatelessWidget {
  final ApplicationDetail detail;
  final void Function(ApplicationRevision r)? onOpen;

  const _SnapshotCard({required this.detail, this.onOpen});

  @override
  Widget build(BuildContext context) {
    final List<ApplicationRevision> revisions = detail.revisions;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        boxShadow: cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Container(
            color: AppColors.cardInfoBackground.withValues(alpha: 0.5),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: <Widget>[
                const Icon(Icons.inventory_2_outlined, size: 15, color: AppColors.textPrimary),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'Bản lưu hồ sơ (Snapshot)',
                    style: TextStyle(
                        fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                  ),
                ),
                if (onOpen != null)
                  InkWell(
                    onTap: () => onOpen!(revisions.first),
                    child: const Row(
                      children: <Widget>[
                        Text(
                          'Xem đầy đủ',
                          style: TextStyle(
                              fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary),
                        ),
                        SizedBox(width: 2),
                        Icon(Icons.north_east, size: 10, color: AppColors.primary),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                if (detail.payloadHash.isNotEmpty) ...<Widget>[
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: tintBox,
                    child: Row(
                      children: <Widget>[
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              const Text(
                                'Khóa xác thực SHA256',
                                style: TextStyle(
                                    fontFamily: 'Inter',
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textSecondary),
                              ),
                              Text(
                                '#SHA256: ${detail.payloadHash}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontFamily: 'monospace', fontSize: 12, color: AppColors.textPrimary),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        const SmallBadge('Đã khóa',
                            color: Color(0xFF005338), background: AppColors.surface, icon: Icons.verified_outlined),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                for (int i = 0; i < revisions.length; i++) ...<Widget>[
                  _RevisionTile(
                    revision: revisions[i],
                    isCurrent: i == 0,
                    onTap: onOpen == null ? null : () => onOpen!(revisions[i]),
                  ),
                  if (i < revisions.length - 1) const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        ],
      ),
    );
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
    return Material(
      color: AppColors.cardInfoBackground,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        key: Key('detail_revision_${r.revision}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: <Widget>[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: const Color(0xFFDAE2FD), borderRadius: BorderRadius.circular(4)),
                child: const Icon(Icons.description_outlined, size: 16, color: AppColors.primary),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: <Widget>[
                        Text(
                          'Lần ${r.revision}',
                          style: const TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary),
                        ),
                        if (isCurrent) const Pill(text: 'Hiện tại', color: AppColors.primary),
                        ScreeningPill(r.screening),
                      ],
                    ),
                    Text(
                      <String>[
                        formatDateTime(r.submittedAt),
                        if (r.isRedacted) 'đã xoá theo chính sách lưu trữ' else '${r.attachmentCount} tệp đính kèm',
                      ].join(' • '),
                      style: const TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              if (onTap != null) const Icon(Icons.open_in_new, size: 14, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

/// One step of "Tiến độ xử lý": past steps are green with a check, the latest is the active primary dot.
class _TimelineEntry extends StatelessWidget {
  final ApplicationEvent event;
  final bool isLast;
  final VoidCallback? onOpenRevision;

  const _TimelineEntry({required this.event, required this.isLast, this.onOpenRevision});

  @override
  Widget build(BuildContext context) {
    final bool active = isLast;
    const TextStyle meta = TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary);
    final String sub = event.reasonLabel ?? '';
    final String when = <String>[
      if (event.createdAt != null) _shortTime(event.createdAt),
      if (event.revision > 0) 'lần ${event.revision}',
    ].join(' • ');
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SizedBox(
            width: 24,
            child: Column(
              children: <Widget>[
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : const Color(0xFF006E4B),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: active
                      ? Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(color: AppColors.background, shape: BoxShape.circle),
                        )
                      : const Icon(Icons.check, size: 14, color: Colors.white),
                ),
                if (!isLast) Expanded(child: Container(width: 2, color: AppColors.primaryLight)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  // Wrap, not Row: at large text scales the time drops under the title instead of overflowing.
                  SizedBox(
                    width: double.infinity,
                    child: Wrap(
                      alignment: WrapAlignment.spaceBetween,
                      spacing: 8,
                      children: <Widget>[
                        Text(
                          event.toStatus.label,
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 12,
                            fontWeight: active ? FontWeight.w700 : FontWeight.w600,
                            color: active ? AppColors.primary : AppColors.textPrimary,
                          ),
                        ),
                        Text(when, style: meta),
                      ],
                    ),
                  ),
                  if (sub.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(sub, style: meta.copyWith(color: active ? AppColors.textPrimary : null)),
                  ],
                  if (onOpenRevision != null)
                    GestureDetector(
                      key: Key('timeline_open_revision_${event.revision}'),
                      onTap: onOpenRevision,
                      child: const Padding(
                        padding: EdgeInsets.only(top: 2),
                        child: Text(
                          'Xem bản đã nộp',
                          style: TextStyle(
                              fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primary),
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
