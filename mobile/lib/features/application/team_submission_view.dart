import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../auth/widgets/auth_widgets.dart';
import 'application_model.dart';
import 'team_submission_model.dart';
import 'team_submission_viewmodel.dart';
import 'widgets/application_widgets.dart';

/// Team submission (APP-05, F37): one screen for the leader and the members.
class TeamSubmissionView extends StatefulWidget {
  final TeamSubmissionViewModel viewModel;

  /// Opens the team Application detail (F28) once the team has submitted.
  final void Function(String applicationId, {required bool justSubmitted}) onOpenApplication;

  /// FR-PROF-05: opens a teammate's profile (PUBLIC + TEAMMATES fields).
  final void Function(String studentId)? onOpenMemberProfile;

  const TeamSubmissionView({
    super.key,
    required this.viewModel,
    required this.onOpenApplication,
    this.onOpenMemberProfile,
  });

  @override
  State<TeamSubmissionView> createState() => _TeamSubmissionViewState();
}

class _TeamSubmissionViewState extends State<TeamSubmissionView> {
  TeamSubmissionViewModel get vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => vm.load());
    vm.addListener(_onChange);
  }

  /// The leader's commit succeeded: go straight to the team Application.
  void _onChange() {
    final String? committed = vm.takeCommittedApplicationId();
    if (committed != null) widget.onOpenApplication(committed, justSubmitted: true);
  }

  @override
  void dispose() {
    vm.removeListener(_onChange);
    vm.dispose();
    super.dispose();
  }

  Future<void> _confirmStart() async {
    final bool restart = vm.isLeaseOver;
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(restart ? 'Bắt đầu lại phiên nộp?' : 'Bắt đầu nộp hồ sơ đội?'),
        content: const Text(
          'Đội sẽ bị khoá 10 phút: không ai được vào hoặc rời đội. Trong thời gian này mọi thành viên, '
          'kể cả bạn, cần mở Scholink để xem lại và đồng ý với hồ sơ của mình.',
          style: TextStyle(height: 1.4),
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Để sau')),
          TextButton(
            key: const Key('team_start_confirm'),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(restart ? 'Bắt đầu lại' : 'Bắt đầu'),
          ),
        ],
      ),
    );
    if (ok == true) await vm.startSubmission();
  }

  Future<void> _confirmCancel() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Huỷ phiên nộp?'),
        content: const Text('Đội được mở khoá và các đồng ý đã thu thập sẽ không còn dùng được.'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Tiếp tục nộp')),
          TextButton(
            key: const Key('team_cancel_confirm'),
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Huỷ phiên'),
          ),
        ],
      ),
    );
    if (ok == true) await vm.cancelSubmission();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: vm,
      builder: (BuildContext context, Widget? child) => Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text(
            'Nộp hồ sơ đội',
            style: TextStyle(
                fontFamily: 'Be Vietnam Pro', fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
          ),
          shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
        ),
        bottomNavigationBar: vm.status == null ? null : _buildLeaderBar(),
        body: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (vm.isLoading && vm.status == null) return const Center(child: CircularProgressIndicator());
    final TeamSubmissionStatus? s = vm.status;
    if (s == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(vm.errorMessage ?? 'Không tải được thông tin nộp hồ sơ đội.', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: vm.load, child: const Text('Thử lại')),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: vm.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          _buildTeamCard(s),
          const SizedBox(height: 12),
          if (vm.actionError != null) ...<Widget>[
            AuthMessageBanner(key: const Key('team_action_error'), message: vm.actionError!),
            const SizedBox(height: 12),
          ],
          if (vm.isLeader && vm.hasUnconfirmedAttempt && !vm.canRetrySubmit) ...<Widget>[
            _buildUnconfirmed(),
            const SizedBox(height: 12),
          ],
          ..._buildState(s),
        ],
      ),
    );
  }

  Widget _buildTeamCard(TeamSubmissionStatus s) {
    final int memberCount = s.members.isNotEmpty ? s.members.length : (vm.team?.memberCount ?? 0);
    final bool counting = s.active && !s.isSubmitted && !vm.isLeaseOver;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.borderLight,
        borderRadius: BorderRadius.circular(6),
        boxShadow: cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: double.infinity,
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 6,
              children: <Widget>[
                SmallBadge(
                  (vm.team?.name ?? 'Đội của bạn').toUpperCase(),
                  color: const Color(0xFF3323CC),
                  background: const Color(0xFFE2DFFF),
                  icon: Icons.groups_outlined,
                ),
                if (counting)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      const CircleAvatar(radius: 4, backgroundColor: _danger),
                      const SizedBox(width: 6),
                      const Text('Còn ',
                          style: TextStyle(
                              fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: _danger)),
                      Text(
                        formatCountdown(vm.leaseSecondsLeft),
                        key: const Key('team_countdown'),
                        style: const TextStyle(
                            fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: _danger),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            vm.competitionTitle,
            style: const TextStyle(
              fontFamily: 'Be Vietnam Pro',
              fontSize: 20,
              height: 28 / 20,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
              color: AppColors.textPrimary,
            ),
          ),
          Text(
            '${vm.isLeader ? 'Trưởng đội' : 'Thành viên'} • $memberCount thành viên • ${_teamStatusLabel(s)}',
            style: const TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  String _teamStatusLabel(TeamSubmissionStatus s) {
    if (s.isSubmitted) return 'Đã nộp hồ sơ';
    if (vm.isLeaseOver) return 'Phiên nộp đã hết hạn';
    if (vm.isSessionOpen) return 'Đang thu thập đồng ý';
    return 'Chưa bắt đầu nộp';
  }

  List<Widget> _buildState(TeamSubmissionStatus s) {
    if (s.isSubmitted) {
      return <Widget>[
        const AuthMessageBanner(message: 'Đội đã nộp hồ sơ cho cuộc thi này.', tone: AuthBannerTone.success),
        const SizedBox(height: 12),
        if (vm.applicationId != null)
          AuthPrimaryButton(
            key: const Key('team_open_application'),
            label: 'Xem hồ sơ đội',
            icon: Icons.visibility_outlined,
            onPressed: () => widget.onOpenApplication(vm.applicationId!, justSubmitted: false),
          ),
      ];
    }
    if (!s.active) {
      return <Widget>[
        if (vm.isLeader) ...<Widget>[
          _buildReadiness(),
          const SizedBox(height: 12),
          const AuthMessageBanner(
            message: 'Khi bắt đầu, đội bị khoá 10 phút để mọi thành viên xem lại và đồng ý với hồ sơ của mình. '
                'Hãy báo cả đội trước khi bấm "Bắt đầu nộp".',
            tone: AuthBannerTone.info,
          ),
        ] else
          const AuthMessageBanner(
            key: Key('team_waiting_leader'),
            message: 'Trưởng đội chưa bắt đầu phiên nộp. Khi trưởng đội bắt đầu, bạn sẽ thấy phần đồng ý ở đây '
                '(kéo xuống để cập nhật).',
            tone: AuthBannerTone.info,
          ),
      ];
    }
    if (vm.isLeaseOver) {
      return <Widget>[
        AuthMessageBanner(
          key: const Key('team_lease_over'),
          message: vm.isLeader
              ? 'Phiên nộp đã hết hạn 10 phút. Bấm "Bắt đầu lại" để mở phiên mới; mọi thành viên cần đồng ý lại.'
              : 'Phiên nộp đã hết hạn. Chờ trưởng đội bắt đầu lại rồi đồng ý lần nữa.',
        ),
        const SizedBox(height: 12),
        _buildMembers(s),
      ];
    }
    return <Widget>[
      _buildMembers(s),
      const SizedBox(height: 12),
      _buildMyPart(),
    ];
  }

  Widget _buildReadiness() {
    final ReadinessResult? r = vm.readiness;
    if (r == null) return const SizedBox.shrink();
    return SectionCard(
      icon: Icons.fact_check_outlined,
      title: 'Passport của bạn',
      trailing: ScreeningPill(r.screening),
      child: r.canProceed
          ? const Text('Passport của bạn đáp ứng điều kiện của cuộc thi.', style: TextStyle(fontSize: 13))
          : Text(
              r.missingFields.isEmpty
                  ? 'Passport của bạn chưa đáp ứng điều kiện của cuộc thi.'
                  : 'Passport còn thiếu: ${r.missingFields.map(missingFieldLabel).join(', ')}',
              style: const TextStyle(fontSize: 13, color: AppColors.error),
            ),
    );
  }

  Widget _buildMembers(TeamSubmissionStatus s) {
    final DateTime now = vm.now;
    final int ready = s.members.where((String m) => s.stateOf(m, now) == MemberConsentState.given).length;
    return SectionCard(
      title: 'Đồng thuận nhóm',
      trailing: SmallBadge('$ready/${s.members.length}',
          color: AppColors.primary, background: AppColors.borderLight, icon: Icons.verified_outlined),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            'Cần ${s.members.length}/${s.members.length} thành viên xác nhận để nộp',
            style: const TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 12),
          for (final String m in s.members) _memberRow(s, m, s.stateOf(m, now)),
        ],
      ),
    );
  }

  Widget _memberRow(TeamSubmissionStatus s, String m, MemberConsentState state) {
    final bool given = state == MemberConsentState.given;
    final bool leader = m == s.leaderId;
    final String name = m == vm.userId ? 'Bạn' : m;
    final String initials = name.length <= 2 ? name.toUpperCase() : name.substring(0, 2).toUpperCase();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: given ? AppColors.cardInfoBackground : const Color(0x4DFFDADB),
        borderRadius: BorderRadius.circular(4),
        child: InkWell(
          key: Key('team_member_$m'),
          borderRadius: BorderRadius.circular(4),
          onTap: m == vm.userId || widget.onOpenMemberProfile == null ? null : () => widget.onOpenMemberProfile!(m),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: <Widget>[
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: leader
                        ? AppColors.primary
                        : given
                            ? const Color(0xFFDAE2FD)
                            : const Color(0xFFFFDADB),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: ExcludeSemantics(
                    child: Text(
                      initials,
                      textScaler: TextScaler.noScaling,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: leader
                            ? Colors.white
                            : given
                                ? AppColors.textPrimary
                                : const Color(0xFF40000D),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Wrap(
                        spacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: <Widget>[
                          Text(
                            name,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary),
                          ),
                          if (leader)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6),
                              decoration: BoxDecoration(
                                  color: const Color(0xFFE2DFFF), borderRadius: BorderRadius.circular(4)),
                              child: const Text('Trưởng nhóm',
                                  style: TextStyle(fontFamily: 'Inter', fontSize: 10, color: Color(0xFF3323CC))),
                            ),
                        ],
                      ),
                      if (!given)
                        const Text('Chờ xác nhận',
                            style: TextStyle(
                                fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(child: _consentLabel(state)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _consentLabel(MemberConsentState state) {
    final (String text, Color color, IconData icon) = switch (state) {
      MemberConsentState.given => ('Đã đồng ý', const Color(0xFF005338), Icons.check_circle_outline),
      MemberConsentState.missing => ('Chưa đồng ý', _danger, Icons.schedule),
      MemberConsentState.needsRenewal => ('Cần đồng ý lại', _danger, Icons.refresh_rounded),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(text,
              style: TextStyle(fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ),
      ],
    );
  }

  Widget _buildMyPart() {
    if (vm.myConsentState == MemberConsentState.given) {
      return AuthMessageBanner(
        key: const Key('team_my_consent_done'),
        message: vm.isLeader
            ? 'Bạn đã đồng ý. Khi mọi thành viên đồng ý, bấm "Nộp hồ sơ chính thức".'
            : 'Bạn đã đồng ý. Chờ trưởng đội nộp hồ sơ.',
        tone: AuthBannerTone.success,
      );
    }
    final ApplicationPreview? p = vm.myPreview;
    if (p == null) {
      return SectionCard(
        icon: Icons.badge_outlined,
        title: 'Phần của bạn',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              vm.myConsentState == MemberConsentState.needsRenewal
                  ? 'Đồng ý trước của bạn đã hết hiệu lực. Hãy xem lại và đồng ý lần nữa.'
                  : 'Xem lại bản Passport sẽ được gửi cùng hồ sơ đội rồi xác nhận đồng ý.',
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              key: const Key('team_my_preview'),
              onPressed: vm.busy ? null : vm.createMyPreview,
              icon: const Icon(Icons.visibility_outlined, size: 18),
              label: const Text('Xem trước hồ sơ của tôi'),
            ),
          ],
        ),
      );
    }
    return SectionCard(
      icon: Icons.badge_outlined,
      title: 'Hồ sơ của bạn sẽ được gửi',
      trailing: ScreeningPill(p.screening),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          PassportSnapshotFields(p.snapshot),
          const SizedBox(height: 8),
          InkWell(
            onTap: vm.busy ? null : () => vm.setConsent(!vm.consentChecked),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Checkbox(
                  key: const Key('team_my_consent_check'),
                  activeColor: AppColors.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(2.5)),
                  value: vm.consentChecked,
                  onChanged: vm.busy ? null : (bool? v) => vm.setConsent(v ?? false),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      'Tôi đồng ý chia sẻ bản hồ sơ trên cho đơn vị tổ chức để đội tham gia "${vm.competitionTitle}".',
                      style: const TextStyle(
                          fontFamily: 'Be Vietnam Pro', fontSize: 14, height: 20 / 14, color: AppColors.textPrimary),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          AuthPrimaryButton(
            key: const Key('team_my_consent_submit'),
            label: 'Đồng ý tham gia nộp',
            icon: Icons.check_rounded,
            isLoading: vm.busy,
            onPressed: vm.consentChecked && !vm.busy ? vm.giveMyConsent : null,
          ),
        ],
      ),
    );
  }

  Widget _buildUnconfirmed() {
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
            'Lần nộp hồ sơ đội trước chưa nhận được xác nhận (có thể do mất mạng hoặc ứng dụng bị đóng).',
            style: TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const Key('team_resume'),
            onPressed: vm.busy ? null : vm.retrySubmit,
            icon: const Icon(Icons.sync_rounded, size: 18),
            label: const Text('Kiểm tra và gửi lại lần nộp đó'),
          ),
        ],
      ),
    );
  }

  /// Leader actions (Q14). Members act inside the page, so they get no bar.
  Widget? _buildLeaderBar() {
    final TeamSubmissionStatus s = vm.status!;
    if (!vm.isLeader || s.isSubmitted) return null;
    final List<Widget> column;
    if (vm.canRetrySubmit) {
      column = <Widget>[
        AuthPrimaryButton(
          key: const Key('team_retry'),
          label: 'Thử lại',
          icon: Icons.replay_rounded,
          isLoading: vm.busy,
          onPressed: vm.busy ? null : vm.retrySubmit,
        ),
      ];
    } else if (!s.active || vm.isLeaseOver) {
      column = <Widget>[
        AuthPrimaryButton(
          key: const Key('team_start'),
          label: vm.isLeaseOver ? 'Bắt đầu lại' : 'Bắt đầu nộp',
          icon: Icons.lock_outline_rounded,
          isLoading: vm.busy,
          onPressed: vm.busy || (!vm.isLeaseOver && vm.readiness?.canProceed == false) ? null : _confirmStart,
        ),
      ];
    } else {
      final DateTime now = vm.now;
      final int waiting = s.members.where((String m) => s.stateOf(m, now) != MemberConsentState.given).length;
      column = <Widget>[
        AuthPrimaryButton(
          key: const Key('team_submit'),
          label: 'Nộp hồ sơ chính thức',
          icon: Icons.send_rounded,
          isLoading: vm.busy,
          onPressed: vm.canSubmit ? vm.submit : null,
        ),
        TextButton(
          key: const Key('team_cancel'),
          onPressed: vm.busy ? null : _confirmCancel,
          style: TextButton.styleFrom(
            foregroundColor: _danger,
            minimumSize: const Size.fromHeight(44),
            textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600),
          ),
          child: const Text('Huỷ phiên'),
        ),
        if (waiting > 0)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              const Icon(Icons.info_outline_rounded, size: 13, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  'Chờ $waiting thành viên đồng ý để mở khóa nút Nộp',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
      ];
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.borderLight)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: column,
        ),
      ),
    );
  }
}

/// Red of the pending / deadline elements in frame 357:27.
const Color _danger = Color(0xFFB90538);
