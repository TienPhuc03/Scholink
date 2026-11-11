import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
            const Text(
              'Bản Lưu Snapshot Hồ Sơ',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontFamily: 'Be Vietnam Pro', fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            ),
            Text(
              'Bản đã nộp · lần ${r.revision}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textSecondary),
            ),
          ],
        ),
        shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          _IntegrityBanner(revision: r, isCurrent: isCurrent),
          const SizedBox(height: 16),
          if (r.isRedacted)
            const AuthMessageBanner(
              key: Key('snapshot_redacted'),
              message: 'Bản chụp này đã được xoá theo chính sách lưu trữ dữ liệu nên không còn nội dung để hiển thị.',
            )
          else if (r.isTeam)
            ..._buildTeam(context, r)
          else
            ..._buildIndividual(r),
          const SizedBox(height: 16),
          SectionCard(
            icon: Icons.hub_outlined,
            title: 'Ngữ cảnh nộp hồ sơ',
            child: Column(
              children: <Widget>[
                _ContextRow('Cơ hội', opportunityTitle),
                _ContextRow('Hình thức', r.isTeam ? 'Nộp theo đội' : 'Nộp cá nhân'),
                _ContextRow('Lần nộp', 'Lần ${r.revision}${isCurrent ? ' (hiện tại)' : ''}', last: true),
              ],
            ),
          ),
          const SizedBox(height: 8),
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
          icon: Icons.how_to_reg_outlined,
          title: 'Ứng viên tại thời điểm nộp',
          trailing: ScreeningPill(r.screening),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (r.passport != null) ...<Widget>[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: _Metric(
                        label: 'Độ hoàn thiện (lúc nộp)',
                        value: '${r.passport!.completionScore}',
                        unit: '/ 100',
                        color: AppColors.primary,
                        progress: r.passport!.completionScore / 100,
                      ),
                    ),
                    if (r.passport!.education != null) ...<Widget>[
                      const SizedBox(width: 8),
                      Expanded(
                        child: _Metric(
                          label: 'GPA (lúc nộp)',
                          value: r.passport!.education!.gpaDisplay,
                          color: const Color(0xFF005338),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 16),
                PassportSnapshotFields(r.passport!),
              ],
              if (r.reasons.isNotEmpty) ...<Widget>[const SizedBox(height: 8), ReasonList(r.reasons)],
            ],
          ),
        ),
        const SizedBox(height: 16),
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
      icon: Icons.inventory_2_outlined,
      title: 'Tệp đính kèm (${attachmentIds.length})',
      child: attachmentIds.isEmpty
          ? const Text('Không có tệp đính kèm.', style: TextStyle(fontSize: 13, color: AppColors.textMuted))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                for (final String id in attachmentIds)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(10),
                    decoration: tintBox,
                    child: Row(
                      children: <Widget>[
                        Container(
                          width: 36,
                          height: 36,
                          decoration:
                              BoxDecoration(color: const Color(0xFFDAE2FD), borderRadius: BorderRadius.circular(6)),
                          child: const Icon(Icons.description_outlined, size: 18, color: AppColors.primary),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: SelectableText(
                            _shortId(id),
                            style: const TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary),
                          ),
                        ),
                        const Icon(Icons.verified_outlined, size: 14, color: Color(0xFF005338)),
                      ],
                    ),
                  ),
                const Text(
                  'Tệp được lưu cùng bản nộp; chưa hỗ trợ tải xuống trên ứng dụng.',
                  style: TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
    );
  }

  static String _shortId(String id) => id.length <= 16 ? id : '${id.substring(0, 8)}…${id.substring(id.length - 6)}';
}

/// "1. Cryptographic Integrity Banner" of frame 357:543: content hash, freeze time, immutability notice.
class _IntegrityBanner extends StatelessWidget {
  final ApplicationRevision revision;
  final bool isCurrent;

  const _IntegrityBanner({required this.revision, required this.isCurrent});

  @override
  Widget build(BuildContext context) {
    final ApplicationRevision r = revision;
    const Color green = Color(0xFF005338);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(12),
        boxShadow: cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: const Color(0x26006E4B), borderRadius: BorderRadius.circular(9999)),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(Icons.verified, size: 14, color: green),
                SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'Toàn vẹn dữ liệu (SHA-256)',
                    style: TextStyle(fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: green),
                  ),
                ),
              ],
            ),
          ),
          if (r.payloadHash.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(8),
                boxShadow: cardShadow,
              ),
              child: Row(
                children: <Widget>[
                  const Icon(Icons.fingerprint, size: 16, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      r.payloadHash,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Material(
                    color: AppColors.primaryLight,
                    borderRadius: BorderRadius.circular(6),
                    child: InkWell(
                      key: const Key('snapshot_copy_hash'),
                      borderRadius: BorderRadius.circular(6),
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: r.payloadHash));
                        ScaffoldMessenger.of(context)
                          ..hideCurrentSnackBar()
                          ..showSnackBar(const SnackBar(content: Text('Đã sao chép mã băm.')));
                      },
                      child: const Padding(
                        padding: EdgeInsets.all(6),
                        child: Icon(Icons.copy_rounded, size: 14, color: AppColors.textPrimary, semanticLabel: 'Sao chép mã băm'),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Icon(Icons.lock_clock_outlined, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text.rich(
                  TextSpan(
                    text: 'Đóng băng lúc: ',
                    children: <InlineSpan>[
                      TextSpan(
                        text: formatDateTime(r.submittedAt),
                        style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                      ),
                    ],
                  ),
                  style: const TextStyle(
                      fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${isCurrent ? 'Đây là lần nộp hiện tại. ' : ''}'
            'Bản chụp này không thay đổi khi bạn cập nhật Passport hay nộp lại.',
            style: const TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

/// One tile of the "Locked Metrics Grid".
class _Metric extends StatelessWidget {
  final String label;
  final String value;
  final String? unit;
  final Color color;
  final double? progress;

  const _Metric({required this.label, required this.value, required this.color, this.unit, this.progress});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: tintBox,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            style: const TextStyle(
                fontFamily: 'Inter', fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              text: value,
              children: <InlineSpan>[
                if (unit != null)
                  TextSpan(
                    text: ' $unit',
                    style: const TextStyle(fontFamily: 'Inter', fontSize: 11, color: AppColors.textMuted),
                  ),
              ],
            ),
            style: TextStyle(
                fontFamily: 'Be Vietnam Pro',
                fontSize: 20,
                height: 28 / 20,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
                color: color),
          ),
          if (progress != null) ...<Widget>[
            const SizedBox(height: 4),
            ClipRRect(
              borderRadius: BorderRadius.circular(9999),
              child: LinearProgressIndicator(
                value: progress!.clamp(0, 1).toDouble(),
                minHeight: 6,
                color: color,
                backgroundColor: const Color(0xFFDAE2FD),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Label / value row of "Ngữ cảnh nộp hồ sơ".
class _ContextRow extends StatelessWidget {
  final String label;
  final String value;
  final bool last;

  const _ContextRow(this.label, this.value, {this.last = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: last ? null : const Border(bottom: BorderSide(color: Color(0x80E2E7FF))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label,
              style: const TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(
                  fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}
