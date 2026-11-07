// Team submission session (APP-05, WF07) as returned by `GET /api/v1/teams/:id/submission` (F37).
// The leader freezes the roster for 10 minutes; every member previews and consents with their own
// Passport; the leader then commits the TEAM Application with all members' consents.

String _str(dynamic v) => v is String ? v : (v?.toString() ?? '');
int _int(dynamic v) => (v as num?)?.toInt() ?? 0;
DateTime? _date(dynamic v) => _str(v).isEmpty ? null : DateTime.tryParse(_str(v))?.toLocal();

/// A member preview stays valid for 10 minutes; consents older than this need to be given again
/// before the leader can commit (Q16). A small margin covers clock drift and the request time.
const Duration memberConsentLifetime = Duration(minutes: 9, seconds: 30);

class TeamMemberConsentInfo {
  final String studentId;
  final String previewId;
  final String identityConsentId;
  final String snapshotId;
  final int profileVersion;
  final String payloadHash;
  final DateTime? confirmedAt;

  const TeamMemberConsentInfo({
    required this.studentId,
    required this.previewId,
    required this.identityConsentId,
    required this.snapshotId,
    required this.profileVersion,
    required this.payloadHash,
    required this.confirmedAt,
  });

  factory TeamMemberConsentInfo.fromJson(Map<String, dynamic> json) => TeamMemberConsentInfo(
        studentId: _str(json['studentId']),
        previewId: _str(json['previewId']),
        identityConsentId: _str(json['identityConsentId']),
        snapshotId: _str(json['snapshotId']),
        profileVersion: _int(json['profileVersion']),
        payloadHash: _str(json['payloadHash']),
        confirmedAt: _date(json['confirmedAt']),
      );

  /// Older app versions sent consents without these ids; such a consent cannot be committed.
  bool get hasIds => previewId.isNotEmpty && identityConsentId.isNotEmpty;

  bool isUsableAt(DateTime now) =>
      hasIds && confirmedAt != null && now.difference(confirmedAt!) < memberConsentLifetime;

  Map<String, dynamic> toSubmitJson() => <String, dynamic>{
        'studentId': studentId,
        'previewId': previewId,
        'snapshotId': snapshotId,
        'profileVersion': profileVersion,
        'payloadHash': payloadHash,
        'consentId': identityConsentId,
      };
}

enum MemberConsentState { missing, given, needsRenewal }

class TeamSubmissionStatus {
  final bool active;
  final String teamId;
  final String teamStatus;
  final String leaderId;
  final String reservationId;
  final String competitionId;
  final bool expired;
  final DateTime? leaseExpiresAt;
  final int fencingToken;
  final int rosterVersion;
  final List<String> members;
  final List<TeamMemberConsentInfo> consents;

  const TeamSubmissionStatus({
    required this.active,
    required this.teamId,
    required this.teamStatus,
    required this.leaderId,
    this.reservationId = '',
    this.competitionId = '',
    this.expired = false,
    this.leaseExpiresAt,
    this.fencingToken = 0,
    this.rosterVersion = 0,
    this.members = const <String>[],
    this.consents = const <TeamMemberConsentInfo>[],
  });

  factory TeamSubmissionStatus.fromJson(Map<String, dynamic> json) => TeamSubmissionStatus(
        active: json['active'] == true,
        teamId: _str(json['teamId']),
        teamStatus: _str(json['teamStatus']).toUpperCase(),
        leaderId: _str(json['leaderId']),
        reservationId: _str(json['reservationId']),
        competitionId: _str(json['competitionId']),
        expired: json['expired'] == true,
        leaseExpiresAt: _date(json['leaseExpiresAt']),
        fencingToken: _int(json['fencingToken']),
        rosterVersion: _int(json['rosterVersion']),
        members: json['members'] is List
            ? (json['members'] as List<dynamic>).map(_str).where((String s) => s.isNotEmpty).toList()
            : const <String>[],
        consents: json['consents'] is List
            ? (json['consents'] as List<dynamic>)
                .whereType<Map<String, dynamic>>()
                .map(TeamMemberConsentInfo.fromJson)
                .toList()
            : const <TeamMemberConsentInfo>[],
      );

  bool get isSubmitted => teamStatus == 'SUBMITTED';

  bool isLeader(String? userId) => userId != null && userId == leaderId;

  /// The lease is over: by the server flag or by the local clock.
  bool isLeaseOver(DateTime now) => expired || (leaseExpiresAt != null && !now.isBefore(leaseExpiresAt!));

  TeamMemberConsentInfo? consentOf(String studentId) {
    for (final TeamMemberConsentInfo c in consents) {
      if (c.studentId == studentId) return c;
    }
    return null;
  }

  MemberConsentState stateOf(String studentId, DateTime now) {
    final TeamMemberConsentInfo? c = consentOf(studentId);
    if (c == null) return MemberConsentState.missing;
    return c.isUsableAt(now) ? MemberConsentState.given : MemberConsentState.needsRenewal;
  }

  bool allReady(DateTime now) =>
      members.isNotEmpty && members.every((String m) => stateOf(m, now) == MemberConsentState.given);

  /// Exact body for `POST /api/v1/applications` (TEAM). Stored with its Idempotency-Key so a
  /// retry after a lost response resends the same request (Q17).
  Map<String, dynamic> buildSubmitBody({required int expectedRuleVersion}) => <String, dynamic>{
        'opportunityId': competitionId,
        'submissionType': 'TEAM',
        'teamId': teamId,
        'submissionId': reservationId,
        'reservationId': reservationId,
        'fencingToken': fencingToken,
        'rosterVersion': rosterVersion,
        'expectedRuleVersion': expectedRuleVersion,
        'memberConsents': <Map<String, dynamic>>[
          for (final String m in members)
            if (consentOf(m) != null) consentOf(m)!.toSubmitJson(),
        ],
      };
}
