/// Passport models matching `PassportResponse` in `identity.proto`.
///
/// The gateway forwards gRPC responses, where unset proto3 scalars arrive as
/// defaults (`""`, `0`). The parsers below turn those back into null.
String? _nonEmpty(dynamic v) {
  if (v is! String) return null;
  final String t = v.trim();
  return t.isEmpty ? null : t;
}

double? _positiveDouble(dynamic v) {
  final double? d = (v as num?)?.toDouble();
  return (d == null || d <= 0) ? null : d;
}

int? _positiveInt(dynamic v) {
  final int? i = (v as num?)?.toInt();
  return (i == null || i <= 0) ? null : i;
}

List<String> _stringList(dynamic v) =>
    v is List ? v.map((dynamic e) => e.toString()).where((String s) => s.trim().isNotEmpty).toList() : <String>[];

/// Unified Education Model for MVVM Architecture.
class EducationModel {
  final String institution;
  final String major;
  final int startYear;
  final int? endYear;
  final double? gpa;
  final double gpaScale;

  const EducationModel({
    required this.institution,
    required this.major,
    required this.startYear,
    this.endYear,
    this.gpa,
    this.gpaScale = 4,
  });

  String get gpaDisplay {
    if (gpa == null) return 'Chưa cập nhật GPA';
    String fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
    return '${fmt(gpa!)} / ${fmt(gpaScale)}';
  }

  String get yearsDisplay => endYear != null ? '$startYear – $endYear' : '$startYear – nay';

  /// Returns null when the server sent an empty education block.
  static EducationModel? fromJsonOrNull(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    final String? institution = _nonEmpty(json['institution']);
    final String? major = _nonEmpty(json['major']);
    if (institution == null && major == null) return null;
    final double scale = _positiveDouble(json['gpaScale']) ?? 4;
    return EducationModel(
      institution: institution ?? '',
      major: major ?? '',
      startYear: _positiveInt(json['startYear']) ?? DateTime.now().year,
      endYear: _positiveInt(json['endYear']),
      gpa: _positiveDouble(json['gpa']),
      gpaScale: scale == 10 ? 10 : 4,
    );
  }

  /// Body for UpdatePassportDtoSchema.education (optional keys are omitted, not null).
  Map<String, dynamic> toJson() => <String, dynamic>{
        'institution': institution,
        'major': major,
        'startYear': startYear,
        if (endYear != null) 'endYear': endYear,
        if (gpa != null) 'gpa': gpa,
        'gpaScale': gpaScale,
      };
}

/// Self-declared certificate (CertificateMessage). The server sets [status].
class CertificateModel {
  final String type;
  final String name;
  final String? score;
  final DateTime issuedDate;
  final DateTime? expiryDate;
  final String? assetId;
  final String? status;

  const CertificateModel({
    required this.type,
    required this.name,
    required this.issuedDate,
    this.score,
    this.expiryDate,
    this.assetId,
    this.status,
  });

  bool get isVerified => status == 'VERIFIED';

  static CertificateModel? fromJsonOrNull(dynamic json) {
    if (json is! Map<String, dynamic>) return null;
    final String? name = _nonEmpty(json['name']);
    final DateTime? issued = DateTime.tryParse(_nonEmpty(json['issuedDate']) ?? '');
    if (name == null || issued == null) return null;
    return CertificateModel(
      type: _nonEmpty(json['type']) ?? 'OTHER',
      name: name,
      score: _nonEmpty(json['score']),
      issuedDate: issued,
      expiryDate: DateTime.tryParse(_nonEmpty(json['expiryDate']) ?? ''),
      assetId: _nonEmpty(json['assetId']),
      status: _nonEmpty(json['status']),
    );
  }

  /// Body for CertificateInputSchema (dates as ISO 8601 UTC).
  Map<String, dynamic> toJson() => <String, dynamic>{
        'type': type,
        'name': name,
        if (score != null) 'score': score,
        'issuedDate': issuedDate.toUtc().toIso8601String(),
        if (expiryDate != null) 'expiryDate': expiryDate!.toUtc().toIso8601String(),
        if (assetId != null) 'assetId': assetId,
      };
}

/// Unified Passport Model for MVVM Architecture.
class PassportModel {
  final String studentId;
  final String fullName;
  final String? bio;
  final String? regionCode;
  final String? avatarAssetId;
  final String? cvAssetId;
  final int completionScore;
  final int profileVersion;
  final EducationModel? education;
  final List<String> skills;
  final List<String> achievements;
  final List<CertificateModel> certificates;
  final bool isLookingForTeammate;
  final bool isOpenForScholarship;
  final bool isOpenForMentoring;

  const PassportModel({
    required this.studentId,
    required this.fullName,
    this.bio,
    this.regionCode,
    this.avatarAssetId,
    this.cvAssetId,
    required this.completionScore,
    required this.profileVersion,
    this.education,
    this.skills = const <String>[],
    this.achievements = const <String>[],
    this.certificates = const <CertificateModel>[],
    this.isLookingForTeammate = false,
    this.isOpenForScholarship = false,
    this.isOpenForMentoring = false,
  });

  bool get isHighQualityProfile => completionScore >= 80;

  factory PassportModel.fromJson(Map<String, dynamic> json) {
    final dynamic payload = json['data'] ?? json;
    final Map<String, dynamic> map = payload is Map<String, dynamic> ? payload : <String, dynamic>{};

    final dynamic certRaw = map['certificates'];
    final List<CertificateModel> certificates = certRaw is List
        ? certRaw.map(CertificateModel.fromJsonOrNull).whereType<CertificateModel>().toList()
        : <CertificateModel>[];

    return PassportModel(
      studentId: _nonEmpty(map['studentId']) ?? '',
      fullName: _nonEmpty(map['fullName']) ?? 'Sinh viên',
      bio: _nonEmpty(map['bio']),
      regionCode: _nonEmpty(map['regionCode']),
      avatarAssetId: _nonEmpty(map['avatarAssetId']),
      cvAssetId: _nonEmpty(map['cvAssetId']),
      completionScore: ((map['completionScore'] as num?)?.toInt() ?? 0).clamp(0, 100),
      profileVersion: _positiveInt(map['profileVersion']) ?? _positiveInt(map['version']) ?? 1,
      education: EducationModel.fromJsonOrNull(map['education']),
      skills: _stringList(map['skills']),
      achievements: _stringList(map['achievements']),
      certificates: certificates,
      isLookingForTeammate: (map['isLookingForTeammate'] as bool?) ?? false,
      isOpenForScholarship: (map['isOpenForScholarship'] as bool?) ?? false,
      isOpenForMentoring: (map['isOpenForMentoring'] as bool?) ?? false,
    );
  }
}

/// Editable copy of the Passport fields covered by the form (FR-PROF-01).
/// Asset fields (avatar, CV, certificate files) are left untouched by the form.
class PassportDraft {
  String fullName;
  String bio;
  String regionCode;
  EducationModel? education;
  List<String> skills;
  List<String> achievements;
  List<CertificateModel> certificates;
  bool isLookingForTeammate;
  bool isOpenForScholarship;
  bool isOpenForMentoring;

  PassportDraft({
    required this.fullName,
    this.bio = '',
    this.regionCode = '',
    this.education,
    List<String>? skills,
    List<String>? achievements,
    List<CertificateModel>? certificates,
    this.isLookingForTeammate = false,
    this.isOpenForScholarship = false,
    this.isOpenForMentoring = false,
  })  : skills = skills ?? <String>[],
        achievements = achievements ?? <String>[],
        certificates = certificates ?? <CertificateModel>[];

  factory PassportDraft.fromPassport(PassportModel p) => PassportDraft(
        fullName: p.fullName,
        bio: p.bio ?? '',
        regionCode: p.regionCode ?? '',
        education: p.education,
        skills: List<String>.of(p.skills),
        achievements: List<String>.of(p.achievements),
        certificates: List<CertificateModel>.of(p.certificates),
        isLookingForTeammate: p.isLookingForTeammate,
        isOpenForScholarship: p.isOpenForScholarship,
        isOpenForMentoring: p.isOpenForMentoring,
      );

  /// Body for `PUT /api/v1/profiles/me`. Sends [expectedVersion] for optimistic locking
  /// (409 VERSION_MISMATCH when someone else saved first).
  Map<String, dynamic> toUpdateJson({required int expectedVersion}) {
    final String bioTrim = bio.trim();
    final String regionTrim = regionCode.trim();
    return <String, dynamic>{
      'expectedVersion': expectedVersion,
      'fullName': fullName.trim(),
      'bio': bioTrim,
      if (regionTrim.isNotEmpty) 'regionCode': regionTrim,
      if (education != null) 'education': education!.toJson(),
      'skills': skills,
      'achievements': achievements,
      'certificates': certificates.map((CertificateModel c) => c.toJson()).toList(),
      'isLookingForTeammate': isLookingForTeammate,
      'isOpenForScholarship': isOpenForScholarship,
      'isOpenForMentoring': isOpenForMentoring,
    };
  }
}

/// Backward compatibility aliases
typedef PassportEntity = PassportModel;
typedef EducationEntity = EducationModel;
