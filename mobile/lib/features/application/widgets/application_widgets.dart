import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../passport/passport_model.dart';
import '../application_model.dart';

String formatDateTime(DateTime? d) {
  if (d == null) return '—';
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(d.hour)}:${two(d.minute)} ${two(d.day)}/${two(d.month)}/${d.year}';
}

String formatCountdown(int seconds) {
  final int m = seconds ~/ 60;
  final int s = seconds % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

Color statusColor(ApplicationStatus s) => switch (s) {
      ApplicationStatus.accepted || ApplicationStatus.shortlisted || ApplicationStatus.interview => AppColors.success,
      ApplicationStatus.rejected || ApplicationStatus.ineligible || ApplicationStatus.cancelled => AppColors.error,
      ApplicationStatus.withdrawn || ApplicationStatus.unknown || ApplicationStatus.draft => AppColors.textMuted,
      ApplicationStatus.reviewing || ApplicationStatus.reopened => AppColors.warning,
      ApplicationStatus.submitted => AppColors.primary,
    };

Color screeningColor(Screening s) => switch (s) {
      Screening.eligible => AppColors.success,
      Screening.ineligible => AppColors.error,
      Screening.needsReview => AppColors.warning,
      Screening.unknown => AppColors.textMuted,
    };

class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;

  const Pill({super.key, required this.text, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[Icon(icon, size: 13, color: color), const SizedBox(width: 4)],
          Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  final ApplicationStatus status;

  const StatusPill(this.status, {super.key});

  @override
  Widget build(BuildContext context) => Pill(text: status.label, color: statusColor(status));
}

class ScreeningPill extends StatelessWidget {
  final Screening screening;

  const ScreeningPill(this.screening, {super.key});

  @override
  Widget build(BuildContext context) => Pill(text: screening.label, color: screeningColor(screening));
}

/// White bordered card with an icon title, matching the Passport screens.
class SectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final Widget child;
  final Widget? trailing;

  const SectionCard({super.key, required this.icon, required this.title, required this.child, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(icon, size: 20, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontFamily: 'Be Vietnam Pro',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class ReasonList extends StatelessWidget {
  final List<ScreeningReason> reasons;

  const ReasonList(this.reasons, {super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: reasons
          .map((ScreeningReason r) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text('•  ', style: TextStyle(color: AppColors.textSecondary)),
                    Expanded(
                      child: Text(
                        r.message.isNotEmpty ? r.message : r.code,
                        style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                      ),
                    ),
                  ],
                ),
              ))
          .toList(),
    );
  }
}

/// Label on the left, selectable value on the right.
class KeyValueRow extends StatelessWidget {
  final String label;
  final String value;

  const KeyValueRow(this.label, this.value, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SizedBox(
              width: 110,
              child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ),
            Expanded(child: SelectableText(value, style: const TextStyle(fontSize: 13, color: AppColors.textPrimary))),
          ],
        ),
      );
}

/// The Passport fields as they are shared with an organizer: used by the apply preview (F19)
/// and by the submitted-snapshot screen (F28), so both show exactly the same content.
class PassportSnapshotFields extends StatelessWidget {
  final PassportModel passport;

  const PassportSnapshotFields(this.passport, {super.key});

  @override
  Widget build(BuildContext context) {
    final PassportModel s = passport;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        KeyValueRow('Họ và tên', s.fullName),
        if (s.regionCode != null) KeyValueRow('Khu vực', s.regionCode!),
        if (s.bio != null) KeyValueRow('Giới thiệu', s.bio!),
        if (s.education != null)
          KeyValueRow('Học vấn',
              '${s.education!.institution} · ${s.education!.major} · ${s.education!.yearsDisplay} · GPA ${s.education!.gpaDisplay}'),
        if (s.skills.isNotEmpty) KeyValueRow('Kỹ năng', s.skills.join(', ')),
        if (s.achievements.isNotEmpty) KeyValueRow('Thành tích', s.achievements.join('; ')),
        if (s.certificates.isNotEmpty)
          KeyValueRow('Chứng chỉ',
              s.certificates.map((CertificateModel c) => '${c.name}${c.score != null ? ' (${c.score})' : ''}').join(', ')),
        KeyValueRow('Độ hoàn thiện', '${s.completionScore}%'),
      ],
    );
  }
}
