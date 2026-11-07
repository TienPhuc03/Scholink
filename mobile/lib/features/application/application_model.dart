import 'dart:convert';

import '../passport/passport_model.dart';

/// Models for the individual application flow (F19) and "Hồ sơ của tôi".
/// Field names follow `opportunity.proto` / `identity.proto`; the gateway forwards gRPC
/// responses, so unset strings and numbers arrive as `""` / `0`.

String _str(dynamic v) => v is String ? v : (v?.toString() ?? '');
String? _strOrNull(dynamic v) {
  final String s = _str(v).trim();
  return s.isEmpty ? null : s;
}

int _int(dynamic v) => (v as num?)?.toInt() ?? 0;

DateTime? _date(dynamic v) {
  final String? s = _strOrNull(v);
  return s == null ? null : DateTime.tryParse(s)?.toLocal();
}

List<String> _strings(dynamic v) =>
    v is List ? v.map(_str).where((String s) => s.isNotEmpty).toList() : <String>[];

Map<String, dynamic> unwrapData(dynamic res) {
  if (res is! Map<String, dynamic>) return <String, dynamic>{};
  final dynamic inner = res['data'];
  return inner is Map<String, dynamic> ? inner : res;
}

/// Backend screening outcome (`ELIGIBLE` / `INELIGIBLE` / `NEEDS_REVIEW`).
enum Screening {
  eligible,
  ineligible,
  needsReview,
  unknown;

  static Screening parse(dynamic raw) => switch (_str(raw).toUpperCase()) {
        'ELIGIBLE' => Screening.eligible,
        'INELIGIBLE' => Screening.ineligible,
        'NEEDS_REVIEW' => Screening.needsReview,
        _ => Screening.unknown,
      };

  String get label => switch (this) {
        Screening.eligible => 'Đủ điều kiện',
        Screening.ineligible => 'Không đủ điều kiện',
        Screening.needsReview => 'Cần xét duyệt thủ công',
        Screening.unknown => 'Chưa xác định',
      };
}

class ScreeningReason {
  final String fieldKey;
  final String code;
  final String message;

  const ScreeningReason({required this.fieldKey, required this.code, required this.message});

  static List<ScreeningReason> listFrom(dynamic raw) {
    if (raw is! List) return <ScreeningReason>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map((Map<String, dynamic> m) => ScreeningReason(
              fieldKey: _str(m['ruleFieldKey']),
              code: _str(m['reasonCode']),
              message: _str(m['message']),
            ))
        .where((ScreeningReason r) => r.message.isNotEmpty || r.code.isNotEmpty)
        .toList();
  }
}

/// Vietnamese labels for Passport field keys the backend reports as missing.
String missingFieldLabel(String key) => switch (key) {
      'fullName' => 'Họ và tên',
      'bio' => 'Giới thiệu bản thân',
      'regionCode' => 'Khu vực',
      'education' || 'education.institution' => 'Học vấn (trường)',
      'education.major' => 'Chuyên ngành',
      'education.gpa' || 'gpa' => 'Điểm GPA',
      'skills' => 'Kỹ năng',
      'certificates' => 'Chứng chỉ',
      'achievements' => 'Thành tích',
      'avatarAssetId' || 'avatar' => 'Ảnh đại diện',
      'cvAssetId' || 'cv' => 'CV',
      _ => key,
    };

/// `GET /api/v1/profiles/me/readiness` (CheckReadinessResponse).
class ReadinessResult {
  final String opportunityId;
  final int profileVersion;
  final int ruleVersion;
  final int completionScore;
  final int readinessScore;
  final bool isReady;
  final Screening screening;
  final List<String> missingFields;
  final List<ScreeningReason> reasons;

  const ReadinessResult({
    required this.opportunityId,
    required this.profileVersion,
    required this.ruleVersion,
    required this.completionScore,
    required this.readinessScore,
    required this.isReady,
    required this.screening,
    this.missingFields = const <String>[],
    this.reasons = const <ScreeningReason>[],
  });

  /// Q4: ineligible or missing fields block; NEEDS_REVIEW may continue with a warning.
  bool get canProceed => screening != Screening.ineligible && missingFields.isEmpty;

  factory ReadinessResult.fromJson(Map<String, dynamic> json) => ReadinessResult(
        opportunityId: _str(json['opportunityId']),
        profileVersion: _int(json['profileVersion']),
        ruleVersion: _int(json['ruleVersion']) > 0 ? _int(json['ruleVersion']) : 1,
        completionScore: _int(json['completionScore']).clamp(0, 100),
        readinessScore: _int(json['readinessScore']).clamp(0, 100),
        isReady: json['isReady'] == true,
        screening: Screening.parse(json['screening']),
        missingFields: _strings(json['missingFields']),
        reasons: ScreeningReason.listFrom(json['screeningReasons']),
      );
}

/// `POST /api/v1/applications/previews` (PreviewResponse). Immutable for 10 minutes.
class ApplicationPreview {
  final String previewId;
  final String opportunityId;
  final String submissionId;
  final String snapshotId;
  final int profileVersion;
  final int ruleVersion;
  final String payloadHash;
  final String manifestHash;
  final Screening screening;
  final List<ScreeningReason> reasons;
  final DateTime expiresAt;

  /// The Passport content exactly as it will be sent (parsed from `snapshotJson`).
  final PassportModel snapshot;

  /// Asset ids listed in `manifestJson`.
  final List<String> attachmentIds;

  const ApplicationPreview({
    required this.previewId,
    required this.opportunityId,
    required this.submissionId,
    required this.snapshotId,
    required this.profileVersion,
    required this.ruleVersion,
    required this.payloadHash,
    required this.manifestHash,
    required this.screening,
    required this.expiresAt,
    required this.snapshot,
    this.reasons = const <ScreeningReason>[],
    this.attachmentIds = const <String>[],
  });

  factory ApplicationPreview.fromJson(Map<String, dynamic> json, {DateTime? now}) {
    Map<String, dynamic> snapshotMap = <String, dynamic>{};
    try {
      final dynamic decoded = jsonDecode(_str(json['snapshotJson']));
      if (decoded is Map<String, dynamic>) snapshotMap = decoded;
    } catch (_) {}

    final List<String> attachmentIds = <String>[];
    try {
      final dynamic manifest = jsonDecode(_str(json['manifestJson']));
      if (manifest is List) {
        for (final dynamic item in manifest) {
          if (item is Map<String, dynamic> && _strOrNull(item['assetId']) != null) {
            attachmentIds.add(_str(item['assetId']));
          }
        }
      }
    } catch (_) {}

    return ApplicationPreview(
      previewId: _str(json['previewId']),
      opportunityId: _str(json['opportunityId']),
      submissionId: _str(json['submissionId']),
      snapshotId: _str(json['snapshotId']),
      profileVersion: _int(json['profileVersion']),
      ruleVersion: _int(json['ruleVersion']) > 0 ? _int(json['ruleVersion']) : 1,
      payloadHash: _str(json['payloadHash']),
      manifestHash: _str(json['manifestHash']),
      screening: Screening.parse(json['screening']),
      reasons: ScreeningReason.listFrom(json['screeningReasons']),
      expiresAt: _date(json['expiresAt']) ?? (now ?? DateTime.now()).add(const Duration(minutes: 10)),
      snapshot: PassportModel.fromJson(snapshotMap),
      attachmentIds: attachmentIds,
    );
  }
}

/// Lifecycle of an application (ApplicationStatus in application.entity.ts).
enum ApplicationStatus {
  draft,
  submitted,
  reviewing,
  ineligible,
  shortlisted,
  interview,
  accepted,
  rejected,
  withdrawn,
  reopened,
  cancelled,
  unknown;

  static ApplicationStatus parse(dynamic raw) => switch (_str(raw).toUpperCase()) {
        'DRAFT' => ApplicationStatus.draft,
        'SUBMITTED' => ApplicationStatus.submitted,
        'REVIEWING' => ApplicationStatus.reviewing,
        'INELIGIBLE' => ApplicationStatus.ineligible,
        'SHORTLISTED' => ApplicationStatus.shortlisted,
        'INTERVIEW' => ApplicationStatus.interview,
        'ACCEPTED' => ApplicationStatus.accepted,
        'REJECTED' => ApplicationStatus.rejected,
        'WITHDRAWN' => ApplicationStatus.withdrawn,
        'REOPENED' => ApplicationStatus.reopened,
        'CANCELLED' => ApplicationStatus.cancelled,
        _ => ApplicationStatus.unknown,
      };

  String get label => switch (this) {
        ApplicationStatus.draft => 'Bản nháp',
        ApplicationStatus.submitted => 'Đã nộp',
        ApplicationStatus.reviewing => 'Đang xét duyệt',
        ApplicationStatus.ineligible => 'Không đủ điều kiện',
        ApplicationStatus.shortlisted => 'Vào danh sách ngắn',
        ApplicationStatus.interview => 'Mời phỏng vấn',
        ApplicationStatus.accepted => 'Trúng tuyển',
        ApplicationStatus.rejected => 'Không trúng tuyển',
        ApplicationStatus.withdrawn => 'Đã rút',
        ApplicationStatus.reopened => 'Mở lại',
        ApplicationStatus.cancelled => 'Đã hủy',
        ApplicationStatus.unknown => 'Không rõ',
      };

  /// Withdrawn/cancelled/reopened applications do not block a new submission (Q15).
  bool get isActive => !<ApplicationStatus>{
        ApplicationStatus.withdrawn,
        ApplicationStatus.cancelled,
        ApplicationStatus.reopened,
        ApplicationStatus.draft,
      }.contains(this);
}

/// One row of `GET /api/v1/applications/me` (ApplicationSummaryMessage).
class ApplicationSummary {
  final String id;
  final String opportunityId;
  final String opportunityTitle;
  final String opportunityType;
  final String submissionType;
  final ApplicationStatus status;
  final Screening screening;
  final DateTime? submittedAt;
  final int revision;

  /// Team of a TEAM application; `null` for individual ones.
  final String? teamId;

  const ApplicationSummary({
    required this.id,
    required this.opportunityId,
    required this.opportunityTitle,
    required this.opportunityType,
    required this.submissionType,
    required this.status,
    required this.screening,
    required this.submittedAt,
    required this.revision,
    this.teamId,
  });

  bool get isTeam => submissionType.toUpperCase() == 'TEAM';
  String get displayTitle => opportunityTitle.isNotEmpty ? opportunityTitle : 'Cơ hội $opportunityId';
  String get typeLabel => switch (opportunityType.toUpperCase()) {
        'SCHOLARSHIP' => 'Học bổng',
        'COMPETITION' => 'Cuộc thi',
        _ => '',
      };

  factory ApplicationSummary.fromJson(Map<String, dynamic> json) => ApplicationSummary(
        id: _str(json['id'] ?? json['applicationId']),
        opportunityId: _str(json['opportunityId']),
        opportunityTitle: _str(json['opportunityTitle']),
        opportunityType: _str(json['opportunityType']),
        submissionType: _strOrNull(json['submissionType']) ?? 'INDIVIDUAL',
        status: ApplicationStatus.parse(json['status']),
        screening: Screening.parse(json['screening']),
        submittedAt: _date(json['submittedAt']),
        revision: _int(json['revision']) > 0 ? _int(json['revision']) : 1,
        teamId: _strOrNull(json['teamId']),
      );
}

/// Status change in the application timeline (ApplicationEventMessage).
class ApplicationEvent {
  final String id;
  final ApplicationStatus? fromStatus;
  final ApplicationStatus toStatus;
  final int revision;
  final String? reason;
  final DateTime? createdAt;

  const ApplicationEvent({
    required this.id,
    required this.fromStatus,
    required this.toStatus,
    required this.revision,
    this.reason,
    this.createdAt,
  });

  factory ApplicationEvent.fromJson(Map<String, dynamic> json) => ApplicationEvent(
        id: _str(json['id']),
        fromStatus: _strOrNull(json['fromStatus']) == null ? null : ApplicationStatus.parse(json['fromStatus']),
        toStatus: ApplicationStatus.parse(json['toStatus']),
        revision: _int(json['revision']),
        reason: _strOrNull(json['reason']),
        createdAt: _date(json['createdAt']),
      );

  /// Submissions create a new revision whose snapshot can be opened from the timeline.
  bool get isSubmission => switch (reason) {
        'INITIAL_SUBMISSION' || 'STUDENT_RESUBMITTED' || 'TEAM_INITIAL_SUBMISSION' || 'TEAM_RESUBMITTED' => true,
        _ => false,
      };

  /// Vietnamese text for the backend reason code; an organizer's free-text note is shown as is.
  String? get reasonLabel => switch (reason) {
        null => null,
        'INITIAL_SUBMISSION' => 'Nộp lần đầu',
        'STUDENT_RESUBMITTED' => 'Nộp lại',
        'STUDENT_WITHDRAWN' => 'Bạn đã rút hồ sơ',
        'TEAM_INITIAL_SUBMISSION' => 'Đội nộp lần đầu',
        'TEAM_RESUBMITTED' => 'Đội nộp lại',
        'TEAM_LEADER_WITHDRAWN' => 'Trưởng đội đã rút hồ sơ',
        'ORGANIZER_STATUS_UPDATE' => 'Ban tổ chức cập nhật trạng thái',
        final String note => 'Ghi chú: $note',
      };
}

/// One member's Passport inside a team revision.
class TeamMemberSnapshot {
  final String studentId;
  final int profileVersion;
  final PassportModel passport;
  final List<String> attachmentIds;

  /// Name as submitted, or the student id when the snapshot has none.
  final String displayName;

  const TeamMemberSnapshot({
    required this.studentId,
    required this.profileVersion,
    required this.passport,
    required this.displayName,
    this.attachmentIds = const <String>[],
  });
}

/// One immutable submitted revision (ApplicationRevisionMessage): exactly what the
/// organizer received for that submission (FR-APP-07/08). Never edited afterwards.
class ApplicationRevision {
  final int revision;
  final DateTime? submittedAt;
  final String snapshotId;
  final int profileVersion;
  final int ruleVersion;
  final String payloadHash;
  final String consentId;
  final Screening screening;
  final List<ScreeningReason> reasons;

  /// Removed by the retention policy: the content is no longer available.
  final bool isRedacted;

  /// Individual revision: the shared Passport and the attached asset ids.
  final PassportModel? passport;
  final List<String> attachmentIds;

  /// Team revision: roster version, leader and one Passport per member.
  final int rosterVersion;
  final String? leaderId;
  final List<TeamMemberSnapshot> members;

  const ApplicationRevision({
    required this.revision,
    required this.submittedAt,
    required this.snapshotId,
    required this.profileVersion,
    required this.ruleVersion,
    required this.payloadHash,
    required this.consentId,
    required this.screening,
    this.reasons = const <ScreeningReason>[],
    this.isRedacted = false,
    this.passport,
    this.attachmentIds = const <String>[],
    this.rosterVersion = 0,
    this.leaderId,
    this.members = const <TeamMemberSnapshot>[],
  });

  bool get isTeam => members.isNotEmpty;

  int get attachmentCount =>
      isTeam ? members.fold<int>(0, (int n, TeamMemberSnapshot m) => n + m.attachmentIds.length) : attachmentIds.length;

  factory ApplicationRevision.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> snapshot = _decodeMap(json['snapshotJson']);
    final dynamic manifest = _decodeJson(json['manifestJson']);
    final bool redacted = snapshot['redacted'] == true;
    final dynamic rawMembers = snapshot['members'];
    final bool team = !redacted && rawMembers is List;

    List<TeamMemberSnapshot> members = <TeamMemberSnapshot>[];
    if (team) {
      final Map<String, List<String>> memberFiles = <String, List<String>>{};
      if (manifest is List) {
        for (final dynamic entry in manifest) {
          if (entry is Map<String, dynamic>) {
            memberFiles[_str(entry['studentId'])] = _assetIds(entry['manifest']);
          }
        }
      }
      members = rawMembers.whereType<Map<String, dynamic>>().map((Map<String, dynamic> m) {
        final Map<String, dynamic> passport =
            m['snapshot'] is Map<String, dynamic> ? m['snapshot'] as Map<String, dynamic> : <String, dynamic>{};
        final String studentId = _str(m['studentId']);
        return TeamMemberSnapshot(
          studentId: studentId,
          profileVersion: _int(m['profileVersion']),
          passport: PassportModel.fromJson(passport),
          displayName: _strOrNull(passport['fullName']) ?? studentId,
          attachmentIds: memberFiles[studentId] ?? const <String>[],
        );
      }).toList();
    }

    return ApplicationRevision(
      revision: _int(json['revision']),
      submittedAt: _date(json['submittedAt']),
      snapshotId: _str(json['snapshotId']),
      profileVersion: _int(json['profileVersion']),
      ruleVersion: _int(json['ruleVersion']),
      payloadHash: _str(json['payloadHash']),
      consentId: _str(json['consentId']),
      screening: Screening.parse(json['screening']),
      reasons: ScreeningReason.listFrom(json['screeningReasons']),
      isRedacted: redacted,
      passport: redacted || team ? null : PassportModel.fromJson(snapshot),
      attachmentIds: redacted || team ? const <String>[] : _assetIds(manifest),
      rosterVersion: team ? _int(snapshot['rosterVersion']) : _int(json['rosterVersion']),
      leaderId: team ? _strOrNull(snapshot['leaderId']) : null,
      members: members,
    );
  }
}

dynamic _decodeJson(dynamic raw) {
  try {
    return jsonDecode(_str(raw));
  } catch (_) {
    return null;
  }
}

Map<String, dynamic> _decodeMap(dynamic raw) {
  final dynamic decoded = _decodeJson(raw);
  return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
}

List<String> _assetIds(dynamic manifest) => manifest is List
    ? manifest
        .whereType<Map<String, dynamic>>()
        .map((Map<String, dynamic> item) => _str(item['assetId']))
        .where((String id) => id.isNotEmpty)
        .toList()
    : <String>[];

/// `GET /api/v1/applications/:id` (ApplicationDetailResponse).
class ApplicationDetail {
  final ApplicationSummary summary;
  final int profileVersion;
  final int ruleVersion;
  final String previewId;
  final String snapshotId;
  final String payloadHash;
  final String consentId;
  final List<ScreeningReason> reasons;

  /// Oldest first.
  final List<ApplicationEvent> events;

  /// Newest first.
  final List<ApplicationRevision> revisions;

  /// F28 (Q12): decided by the backend; the app only shows or hides the actions.
  final DateTime? registrationDeadline;
  final bool viewerIsOwner;
  final bool canWithdraw;
  final bool canResubmit;

  const ApplicationDetail({
    required this.summary,
    required this.profileVersion,
    required this.ruleVersion,
    required this.previewId,
    required this.snapshotId,
    required this.payloadHash,
    required this.consentId,
    this.reasons = const <ScreeningReason>[],
    this.events = const <ApplicationEvent>[],
    this.revisions = const <ApplicationRevision>[],
    this.registrationDeadline,
    this.viewerIsOwner = false,
    this.canWithdraw = false,
    this.canResubmit = false,
  });

  ApplicationRevision? revisionNumber(int n) {
    for (final ApplicationRevision r in revisions) {
      if (r.revision == n) return r;
    }
    return null;
  }

  bool get isClosedOutcome => <ApplicationStatus>{
        ApplicationStatus.accepted,
        ApplicationStatus.rejected,
        ApplicationStatus.cancelled,
      }.contains(summary.status);

  factory ApplicationDetail.fromJson(Map<String, dynamic> json) {
    final List<ApplicationEvent> events = json['events'] is List
        ? (json['events'] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .map(ApplicationEvent.fromJson)
            .toList()
        : <ApplicationEvent>[];
    // Backend returns newest first; the timeline reads top-down from the oldest.
    final bool allTimed = events.every((ApplicationEvent e) => e.createdAt != null);
    final List<ApplicationEvent> ordered = allTimed
        ? (List<ApplicationEvent>.of(events)
          ..sort((ApplicationEvent a, ApplicationEvent b) => a.createdAt!.compareTo(b.createdAt!)))
        : events.reversed.toList();
    final List<ApplicationRevision> revisions = json['revisions'] is List
        ? ((json['revisions'] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .map(ApplicationRevision.fromJson)
            .toList()
          ..sort((ApplicationRevision a, ApplicationRevision b) => b.revision.compareTo(a.revision)))
        : <ApplicationRevision>[];
    return ApplicationDetail(
      summary: ApplicationSummary.fromJson(json),
      profileVersion: _int(json['profileVersion']),
      ruleVersion: _int(json['ruleVersion']),
      previewId: _str(json['previewId']),
      snapshotId: _str(json['snapshotId']),
      payloadHash: _str(json['payloadHash']),
      consentId: _str(json['consentId']),
      reasons: ScreeningReason.listFrom(json['screeningReasons']),
      events: ordered,
      revisions: revisions,
      registrationDeadline: _date(json['registrationDeadline']),
      viewerIsOwner: json['viewerIsOwner'] == true,
      canWithdraw: json['canWithdraw'] == true,
      canResubmit: json['canResubmit'] == true,
    );
  }
}

/// Result of `POST /api/v1/applications` (SubmitApplicationResponse).
class SubmitResult {
  final String applicationId;
  final ApplicationStatus status;
  final Screening screening;
  final int revision;

  const SubmitResult({
    required this.applicationId,
    required this.status,
    required this.screening,
    required this.revision,
  });

  factory SubmitResult.fromJson(Map<String, dynamic> json) => SubmitResult(
        applicationId: _str(json['applicationId'] ?? json['id']),
        status: ApplicationStatus.parse(json['status']),
        screening: Screening.parse(json['screening']),
        revision: _int(json['revision']),
      );
}
