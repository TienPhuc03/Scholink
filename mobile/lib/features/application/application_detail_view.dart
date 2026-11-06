import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../auth/widgets/auth_widgets.dart';
import 'application_model.dart';
import 'my_applications_viewmodel.dart';
import 'widgets/application_widgets.dart';

/// Read-only application detail with the status timeline (F19).
/// Withdraw, resubmit and viewing the shared snapshot come in F28.
class ApplicationDetailView extends StatefulWidget {
  final ApplicationDetailViewModel viewModel;
  final bool justSubmitted;

  const ApplicationDetailView({super.key, required this.viewModel, this.justSubmitted = false});

  @override
  State<ApplicationDetailView> createState() => _ApplicationDetailViewState();
}

class _ApplicationDetailViewState extends State<ApplicationDetailView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.viewModel.load());
  }

  @override
  void dispose() {
    widget.viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Chi tiết hồ sơ'),
        shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      body: ListenableBuilder(
        listenable: widget.viewModel,
        builder: (BuildContext context, Widget? child) {
          final ApplicationDetailViewModel vm = widget.viewModel;
          final ApplicationDetail? d = vm.detail;
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
                          children: List<Widget>.generate(
                            d.events.length,
                            (int i) => _TimelineEntry(event: d.events[i], isLast: i == d.events.length - 1),
                          ),
                        ),
                ),
                const SizedBox(height: 12),
                Theme(
                  data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('Chi tiết kỹ thuật',
                        style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
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
        },
      ),
    );
  }
}

class _TimelineEntry extends StatelessWidget {
  final ApplicationEvent event;
  final bool isLast;

  const _TimelineEntry({required this.event, required this.isLast});

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
                  if (event.reason != null)
                    Text(event.reason!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
