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

/// FR-PROF-05: who may see a Passport field.
enum FieldVisibility {
  private('PRIVATE', 'Chỉ mình tôi'),
  teammates('TEAMMATES', 'Đồng đội'),
  public('PUBLIC', 'Công khai');

  final String apiValue;
  final String label;

  const FieldVisibility(this.apiValue, this.label);

  static FieldVisibility? parse(dynamic raw) {
    for (final FieldVisibility v in values) {
      if (v.apiValue == raw?.toString().toUpperCase()) return v;
    }
    return null;
  }
}

typedef PrivacyFieldInfo = ({String key, String label, FieldVisibility byDefault});

/// Fields whose visibility the student chooses, with their labels and the server defaults.
/// Full name and avatar are always visible.
const List<PrivacyFieldInfo> privacyFields = <PrivacyFieldInfo>[
  (key: 'email', label: 'Email', byDefault: FieldVisibility.private),
  (key: 'phone', label: 'Số điện thoại', byDefault: FieldVisibility.private),
  (key: 'bio', label: 'Giới thiệu', byDefault: FieldVisibility.public),
  (key: 'regionCode', label: 'Khu vực', byDefault: FieldVisibility.public),
  (key: 'skills', label: 'Kỹ năng', byDefault: FieldVisibility.public),
  (key: 'education', label: 'Học vấn', byDefault: FieldVisibility.teammates),
  (key: 'certificates', label: 'Chứng chỉ', byDefault: FieldVisibility.teammates),
  (key: 'achievements', label: 'Thành tích', byDefault: FieldVisibility.teammates),
  (key: 'cv', label: 'CV', byDefault: FieldVisibility.teammates),
  (key: 'pitchVideo', label: 'Video giới thiệu', byDefault: FieldVisibility.teammates),
];

/// Server settings over the defaults; unknown keys and values are ignored.
Map<String, FieldVisibility> resolveFieldPrivacy(dynamic raw) => <String, FieldVisibility>{
      for (final PrivacyFieldInfo f in privacyFields)
        f.key: (raw is Map ? FieldVisibility.parse(raw[f.key]) : null) ?? f.byDefault,
    };

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

  /// Owner-only data (FR-PROF-05): contact details and the visibility of each field.
  final String? email;
  final String? phone;
  final Map<String, FieldVisibility> fieldPrivacy;

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
    this.email,
    this.phone,
    this.fieldPrivacy = const <String, FieldVisibility>{},
  });

  bool get isHighQualityProfile => completionScore >= 80;

  FieldVisibility visibilityOf(String field) =>
      fieldPrivacy[field] ?? privacyFields.firstWhere((PrivacyFieldInfo f) => f.key == field).byDefault;

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
      email: _nonEmpty(map['email']),
      phone: _nonEmpty(map['phone']),
      fieldPrivacy: resolveFieldPrivacy(map['fieldPrivacy']),
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
  String phone;
  Map<String, FieldVisibility> fieldPrivacy;

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
    this.phone = '',
    Map<String, FieldVisibility>? fieldPrivacy,
  })  : fieldPrivacy = fieldPrivacy ?? resolveFieldPrivacy(null),
        skills = skills ?? <String>[],
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
        phone: p.phone ?? '',
        fieldPrivacy: <String, FieldVisibility>{...resolveFieldPrivacy(null), ...p.fieldPrivacy},
      );

  /// Body for `PUT /api/v1/profiles/me/privacy` (does not change the profile version).
  Map<String, dynamic> toPrivacyJson() => <String, dynamic>{
        'fieldPrivacy': <String, String>{
          for (final MapEntry<String, FieldVisibility> e in fieldPrivacy.entries) e.key: e.value.apiValue,
        },
      };

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
      'phone': phone.trim(),
    };
  }
}

/// Another person's view of a Passport (FR-PROF-05): `GET /profiles/:id`, `/profiles/me/view`
/// or the teammate profile. Fields that were not granted are absent; [visibleFields] tells
/// "hidden" apart from "empty", because gRPC sends unset values as "" or [].
class ProfileView {
  final String studentId;
  final String fullName;
  final String? avatarAssetId;
  final String audience;
  final Set<String> visibleFields;
  final String? email;
  final String? phone;
  final String? bio;
  final String? regionCode;
  final List<String> skills;
  final EducationModel? education;
  final List<CertificateModel> certificates;
  final List<String> achievements;
  final String? cvAssetId;
  final String? pitchVideoAssetId;

  const ProfileView({
    required this.studentId,
    required this.fullName,
    required this.audience,
    required this.visibleFields,
    this.avatarAssetId,
    this.email,
    this.phone,
    this.bio,
    this.regionCode,
    this.skills = const <String>[],
    this.education,
    this.certificates = const <CertificateModel>[],
    this.achievements = const <String>[],
    this.cvAssetId,
    this.pitchVideoAssetId,
  });

  bool shows(String field) => visibleFields.contains(field);

  factory ProfileView.fromJson(Map<String, dynamic> json) {
    final dynamic payload = json['data'] ?? json;
    final Map<String, dynamic> map = payload is Map<String, dynamic> ? payload : <String, dynamic>{};
    final Set<String> visible = _stringList(map['visibleFields']).toSet();
    final dynamic certRaw = map['certificates'];
    return ProfileView(
      studentId: _nonEmpty(map['studentId']) ?? '',
      fullName: _nonEmpty(map['fullName']) ?? 'Sinh viên',
      avatarAssetId: _nonEmpty(map['avatarAssetId']),
      audience: _nonEmpty(map['audience']) ?? 'PUBLIC',
      visibleFields: visible,
      email: visible.contains('email') ? _nonEmpty(map['email']) : null,
      phone: visible.contains('phone') ? _nonEmpty(map['phone']) : null,
      bio: visible.contains('bio') ? _nonEmpty(map['bio']) : null,
      regionCode: visible.contains('regionCode') ? _nonEmpty(map['regionCode']) : null,
      skills: visible.contains('skills') ? _stringList(map['skills']) : const <String>[],
      education: visible.contains('education') ? EducationModel.fromJsonOrNull(map['education']) : null,
      certificates: visible.contains('certificates') && certRaw is List
          ? certRaw.map(CertificateModel.fromJsonOrNull).whereType<CertificateModel>().toList()
          : const <CertificateModel>[],
      achievements: visible.contains('achievements') ? _stringList(map['achievements']) : const <String>[],
      cvAssetId: visible.contains('cv') ? _nonEmpty(map['cvAssetId']) : null,
      pitchVideoAssetId: visible.contains('pitchVideo') ? _nonEmpty(map['pitchVideoAssetId']) : null,
    );
  }
}

/// Backward compatibility aliases
typedef PassportEntity = PassportModel;
typedef EducationEntity = EducationModel;
