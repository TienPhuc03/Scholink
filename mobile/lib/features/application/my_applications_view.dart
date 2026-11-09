import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/refresh_error_banner.dart';
import 'application_model.dart';
import 'my_applications_viewmodel.dart';
import 'widgets/application_widgets.dart';

/// "Hồ sơ của tôi" list (Q6: opened from the Passport tab). Reloads every time it opens (Q11).
class MyApplicationsView extends StatefulWidget {
  final MyApplicationsViewModel viewModel;
  final ValueChanged<String> onOpenApplication;

  const MyApplicationsView({super.key, required this.viewModel, required this.onOpenApplication});

  @override
  State<MyApplicationsView> createState() => _MyApplicationsViewState();
}

class _MyApplicationsViewState extends State<MyApplicationsView> {
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
        title: const Text('Hồ sơ ứng tuyển của tôi'),
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
          return RefreshIndicator(
            onRefresh: vm.load,
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: vm.items.length + (stale ? 1 : 0),
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (BuildContext context, int index) {
                if (stale && index == 0) return RefreshErrorBanner(message: vm.errorMessage, onRetry: vm.load);
                final ApplicationSummary a = vm.items[index - (stale ? 1 : 0)];
                return Material(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(8),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => widget.onOpenApplication(a.id),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.borderLight),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Expanded(
                                child: Text(
                                  a.displayTitle,
                                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                                ),
                              ),
                              const SizedBox(width: 8),
                              StatusPill(a.status),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            <String>[
                              if (a.typeLabel.isNotEmpty) a.typeLabel,
                              a.isTeam ? 'Nộp theo đội' : 'Cá nhân',
                              'Nộp ${formatDateTime(a.submittedAt)}',
                              if (a.revision > 1) 'Lần ${a.revision}',
                            ].join(' · '),
                            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
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
