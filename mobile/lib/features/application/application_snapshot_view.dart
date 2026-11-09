import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../auth/widgets/auth_widgets.dart';
import 'application_model.dart';
import 'widgets/application_widgets.dart';

/// Read-only view of one submitted revision: exactly what the organizer received (FR-APP-08).
/// Later Passport edits or resubmissions never change it. Data comes from the already loaded
/// application detail, so opening it makes no request (Q13).
class ApplicationSnapshotView extends StatelessWidget {
  final String opportunityTitle;
  final ApplicationRevision revision;
  final bool isCurrent;

  const ApplicationSnapshotView({
    super.key,
    required this.opportunityTitle,
    required this.revision,
    this.isCurrent = false,
  });

  @override
  Widget build(BuildContext context) {
    final ApplicationRevision r = revision;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Bản đã nộp · lần ${r.revision}'),
            Text(
              opportunityTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textSecondary),
            ),
          ],
        ),
        shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          AuthMessageBanner(
            message: '${isCurrent ? 'Đây là lần nộp hiện tại. ' : ''}'
                'Nội dung dưới đây là bản chụp lúc nộp ${formatDateTime(r.submittedAt)}; '
                'nó không thay đổi khi bạn cập nhật Passport hay nộp lại.',
            tone: AuthBannerTone.info,
          ),
          const SizedBox(height: 12),
          if (r.isRedacted)
            const AuthMessageBanner(
              key: Key('snapshot_redacted'),
              message: 'Bản chụp này đã được xoá theo chính sách lưu trữ dữ liệu nên không còn nội dung để hiển thị.',
            )
          else if (r.isTeam)
            ..._buildTeam(context, r)
          else
            ..._buildIndividual(r),
          const SizedBox(height: 12),
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Chi tiết kỹ thuật', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                KeyValueRow('Mã snapshot', r.snapshotId),
                KeyValueRow('Mã đồng ý', r.consentId),
                KeyValueRow('Phiên bản hồ sơ / quy tắc', 'v${r.profileVersion} / v${r.ruleVersion}'),
                KeyValueRow('Mã băm nội dung', r.payloadHash),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildIndividual(ApplicationRevision r) => <Widget>[
        SectionCard(
          icon: Icons.badge_outlined,
          title: 'Hồ sơ đã chia sẻ',
          trailing: ScreeningPill(r.screening),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (r.passport != null) PassportSnapshotFields(r.passport!),
              if (r.reasons.isNotEmpty) ...<Widget>[const SizedBox(height: 8), ReasonList(r.reasons)],
            ],
          ),
        ),
        const SizedBox(height: 12),
        _AttachmentsCard(attachmentIds: r.attachmentIds),
      ];

  List<Widget> _buildTeam(BuildContext context, ApplicationRevision r) => <Widget>[
        SectionCard(
          icon: Icons.groups_outlined,
          title: 'Danh sách đội${r.rosterVersion > 0 ? ' · phiên bản ${r.rosterVersion}' : ''}',
          trailing: ScreeningPill(r.screening),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (r.reasons.isNotEmpty) ...<Widget>[ReasonList(r.reasons), const SizedBox(height: 8)],
              for (final TeamMemberSnapshot m in r.members)
                if (m.isRestricted)
                  ListTile(
                    key: Key('snapshot_member_${m.studentId}'),
                    contentPadding: EdgeInsets.zero,
                    title: _memberName(m, r),
                    subtitle: const Text('Hồ sơ riêng của thành viên',
                        style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  )
                else
                  // The card paints its own background, so the tile needs a Material to draw on.
                  Material(
                    type: MaterialType.transparency,
                    child: Theme(
                      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        key: Key('snapshot_member_${m.studentId}'),
                        tilePadding: EdgeInsets.zero,
                        childrenPadding: const EdgeInsets.only(bottom: 8),
                        title: _memberName(m, r),
                        subtitle: Text('Hồ sơ v${m.profileVersion} · ${m.attachmentIds.length} tệp đính kèm',
                            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        expandedCrossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[PassportSnapshotFields(m.passport)],
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ];

  Widget _memberName(TeamMemberSnapshot m, ApplicationRevision r) => Row(
        children: <Widget>[
          Flexible(
            child: Text(m.displayName,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis),
          ),
          if (m.studentId == r.leaderId) ...<Widget>[
            const SizedBox(width: 6),
            const Pill(text: 'Trưởng đội', color: AppColors.primary),
          ],
        ],
      );
}

/// Q6: the manifest only carries asset ids and media storage is simulated, so files are listed
/// by a short id without a download action.
class _AttachmentsCard extends StatelessWidget {
  final List<String> attachmentIds;

  const _AttachmentsCard({required this.attachmentIds});

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      icon: Icons.attach_file_rounded,
      title: 'Tệp đính kèm (${attachmentIds.length})',
      child: attachmentIds.isEmpty
          ? const Text('Không có tệp đính kèm.', style: TextStyle(fontSize: 13, color: AppColors.textMuted))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                for (final String id in attachmentIds)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: <Widget>[
                        const Icon(Icons.insert_drive_file_outlined, size: 16, color: AppColors.textSecondary),
                        const SizedBox(width: 6),
                        Expanded(child: SelectableText(_shortId(id), style: const TextStyle(fontSize: 13))),
                      ],
                    ),
                  ),
                const SizedBox(height: 4),
                const Text(
                  'Tệp được lưu cùng bản nộp; chưa hỗ trợ tải xuống trên ứng dụng.',
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
    );
  }

  static String _shortId(String id) => id.length <= 16 ? id : '${id.substring(0, 8)}…${id.substring(id.length - 6)}';
}
