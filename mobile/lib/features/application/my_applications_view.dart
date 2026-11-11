import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/refresh_error_banner.dart';
import 'application_model.dart';
import 'my_applications_viewmodel.dart';

/// "Hồ sơ của tôi" list (Q6: opened from the Passport tab). Reloads every time it opens (Q11).
class MyApplicationsView extends StatefulWidget {
  final MyApplicationsViewModel viewModel;
  final ValueChanged<String> onOpenApplication;

  const MyApplicationsView({super.key, required this.viewModel, required this.onOpenApplication});

  @override
  State<MyApplicationsView> createState() => _MyApplicationsViewState();
}

class _MyApplicationsViewState extends State<MyApplicationsView> {
  _Group? _filter;

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
        title: const Text(
          'Đơn Ứng Tuyển',
          style: TextStyle(
            fontFamily: 'Be Vietnam Pro',
            fontSize: 20,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.2,
            color: AppColors.textPrimary,
          ),
        ),
        shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      body: ListenableBuilder(
        listenable: widget.viewModel,
        builder: (BuildContext context, Widget? child) {
          final MyApplicationsViewModel vm = widget.viewModel;
          if (vm.isLoading && vm.items.isEmpty) return const Center(child: CircularProgressIndicator());
          if (vm.hasError && vm.items.isEmpty) {
            return _Message(
              icon: Icons.cloud_off_rounded,
              text: vm.errorMessage ?? 'Không tải được danh sách hồ sơ.',
              action: OutlinedButton(onPressed: vm.load, child: const Text('Thử lại')),
            );
          }
          if (vm.items.isEmpty) {
            return RefreshIndicator(
              onRefresh: vm.load,
              child: ListView(
                children: const <Widget>[
                  SizedBox(height: 80),
                  _Message(
                    icon: Icons.inbox_outlined,
                    text: 'Bạn chưa nộp hồ sơ nào.\nHãy mở một học bổng hoặc cuộc thi và chọn "Nộp hồ sơ trực tuyến".',
                  ),
                ],
              ),
            );
          }
          final bool stale = vm.hasError;
          final List<ApplicationSummary> shown =
              _filter == null ? vm.items : vm.items.where((ApplicationSummary a) => _group(a.status) == _filter).toList();
          int count(_Group g) => vm.items.where((ApplicationSummary a) => _group(a.status) == g).length;
          return RefreshIndicator(
            onRefresh: vm.load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: <Widget>[
                if (stale) ...<Widget>[RefreshErrorBanner(message: vm.errorMessage, onRetry: vm.load), const SizedBox(height: 12)],
                _SummaryBar(total: vm.items.length, inProgress: count(_Group.reviewing)),
                const SizedBox(height: 16),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: <Widget>[
                      _FilterChip('Tất cả (${vm.items.length})', _filter == null, () => setState(() => _filter = null)),
                      for (final _Group g in _Group.values)
                        _FilterChip('${g.label} (${count(g)})', _filter == g, () => setState(() => _filter = g)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (shown.isEmpty)
                  const _Message(icon: Icons.filter_alt_off_outlined, text: 'Không có đơn nào ở trạng thái này.'),
                for (final ApplicationSummary a in shown) ...<Widget>[
                  _ApplicationCard(a, onTap: () => widget.onOpenApplication(a.id)),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Filter tabs of the Figma frame "Đơn ứng tuyển" (357:215); withdrawn/cancelled/draft only show under "Tất cả".
enum _Group {
  reviewing('Đang duyệt'),
  accepted('Đã duyệt'),
  rejected('Từ chối');

  final String label;
  const _Group(this.label);
}

_Group? _group(ApplicationStatus s) => switch (s) {
      ApplicationStatus.submitted ||
      ApplicationStatus.reviewing ||
      ApplicationStatus.reopened ||
      ApplicationStatus.shortlisted ||
      ApplicationStatus.interview =>
        _Group.reviewing,
      ApplicationStatus.accepted => _Group.accepted,
      ApplicationStatus.rejected || ApplicationStatus.ineligible => _Group.rejected,
      _ => null,
    };

String _date(DateTime? d) {
  if (d == null) return '—';
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year}';
}

class _SummaryBar extends StatelessWidget {
  final int total;
  final int inProgress;

  const _SummaryBar({required this.total, required this.inProgress});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(color: AppColors.cardInfoBackground, borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: <Widget>[
          const Icon(Icons.fact_check_outlined, size: 16, color: AppColors.primary),
          const SizedBox(width: 4),
          Expanded(
            child: Text.rich(
              TextSpan(
                text: 'Tổng số đơn: ',
                children: <InlineSpan>[
                  TextSpan(
                    text: total.toString().padLeft(2, '0'),
                    style: const TextStyle(color: AppColors.textPrimary),
                  ),
                ],
              ),
              style: const TextStyle(
                  fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textSecondary),
            ),
          ),
          if (inProgress > 0) ...<Widget>[
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(color: Color(0xFF006E4B), shape: BoxShape.circle),
            ),
            const SizedBox(width: 4),
            Text(
              '$inProgress đang xử lý',
              style: const TextStyle(
                  fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF005338)),
            ),
          ],
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String text;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip(this.text, this.selected, this.onTap);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: selected ? const Color(0xFF4F46E5) : AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Text(
              text,
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: selected ? AppColors.textOnPrimary : AppColors.textSecondary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Card look per status, from the four sample cards of frame 357:215.
({Color bg, Color fg, IconData? icon, String footer, String link, Color linkColor, bool dim}) _cardStyle(
        ApplicationStatus s) =>
    switch (s) {
      ApplicationStatus.accepted => (
          bg: const Color(0xFF6FFBBE),
          fg: const Color(0xFF005236),
          icon: Icons.check_circle_outline,
          footer: 'Hồ sơ hoàn tất',
          link: 'Xem chi tiết',
          linkColor: AppColors.primary,
          dim: false,
        ),
      ApplicationStatus.reopened => (
          bg: const Color(0xFFFFDADB),
          fg: const Color(0xFFB90538),
          icon: Icons.error_outline,
          footer: 'Hồ sơ được mở lại',
          link: 'Bổ sung hồ sơ',
          linkColor: const Color(0xFFB90538),
          dim: false,
        ),
      ApplicationStatus.rejected ||
      ApplicationStatus.ineligible ||
      ApplicationStatus.withdrawn ||
      ApplicationStatus.cancelled ||
      ApplicationStatus.unknown =>
        (
          bg: AppColors.primaryLight,
          fg: AppColors.textSecondary,
          icon: Icons.cancel_outlined,
          footer: 'Kỳ tuyển đã hoàn tất',
          link: 'Xem lý do',
          linkColor: AppColors.textSecondary,
          dim: true,
        ),
      _ => (
          bg: AppColors.primaryLight,
          fg: AppColors.textPrimary,
          icon: null,
          footer: 'Đang chờ ban tổ chức',
          link: 'Xem chi tiết',
          linkColor: AppColors.primary,
          dim: false,
        ),
    };

class _ApplicationCard extends StatelessWidget {
  final ApplicationSummary a;
  final VoidCallback onTap;

  const _ApplicationCard(this.a, {required this.onTap});

  @override
  Widget build(BuildContext context) {
    final style = _cardStyle(a.status);
    const TextStyle meta = TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary);
    final List<String> details = <String>[
      if (a.typeLabel.isNotEmpty) a.typeLabel,
      a.isTeam ? 'Nộp theo đội' : 'Cá nhân',
      if (a.revision > 1) 'Lần ${a.revision}',
    ];
    return Opacity(
      opacity: style.dim ? 0.85 : 1,
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        elevation: 0.5,
        shadowColor: Colors.black26,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(8)),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: <Widget>[
                              if (style.icon != null)
                                Icon(style.icon, size: 12, color: style.fg)
                              else
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                                ),
                              const SizedBox(width: 4),
                              Text(
                                a.status.label,
                                style: TextStyle(
                                    fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: style.fg),
                              ),
                            ],
                          ),
                        ),
                        const Spacer(),
                        Text(_date(a.submittedAt), style: meta),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      a.displayTitle,
                      style: const TextStyle(
                        fontFamily: 'Be Vietnam Pro',
                        fontSize: 18,
                        height: 24 / 18,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(details.join(' • '), style: meta),
                  ],
                ),
              ),
              Container(
                color: AppColors.cardInfoBackground.withValues(alpha: 0.6),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        style.footer,
                        style: TextStyle(
                            fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w500, color: style.fg),
                      ),
                    ),
                    Text(
                      style.link,
                      style: TextStyle(
                          fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: style.linkColor),
                    ),
                    Icon(Icons.arrow_forward, size: 12, color: style.linkColor),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  final IconData icon;
  final String text;
  final Widget? action;

  const _Message({required this.icon, required this.text, this.action});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 48, color: AppColors.textMuted),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary)),
            if (action != null) ...<Widget>[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}
