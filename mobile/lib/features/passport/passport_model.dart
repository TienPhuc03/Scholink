/// Unified Education Model for MVVM Architecture.
class EducationModel {
  final String institution;
  final String major;
  final int startYear;
  final int? endYear;
  final double? gpa;
  final double? gpaScale;

  const EducationModel({
    required this.institution,
    required this.major,
    required this.startYear,
    this.endYear,
    this.gpa,
    this.gpaScale,
  });

  String get gpaDisplay =>
      gpa != null ? '$gpa / ${gpaScale ?? 4.0}' : 'Chưa cập nhật GPA';

  factory EducationModel.fromJson(Map<String, dynamic> json) {
    return EducationModel(
      institution: (json['institution'] ?? '') as String,
      major: (json['major'] ?? '') as String,
      startYear: (json['startYear'] as num?)?.toInt() ?? 2022,
      endYear: (json['endYear'] as num?)?.toInt(),
      gpa: (json['gpa'] as num?)?.toDouble(),
      gpaScale: (json['gpaScale'] as num?)?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'institution': institution,
        'major': major,
        'startYear': startYear,
        'endYear': endYear,
        'gpa': gpa,
        'gpaScale': gpaScale,
      };
}

/// Unified Passport Model for MVVM Architecture.
class PassportModel {
  final String studentId;
  final String fullName;
  final String? bio;
  final String? avatarAssetId;
  final int completionScore;
  final int profileVersion;
  final EducationModel? education;
  final List<String> skills;
  final List<String> achievements;
  final bool isLookingForTeammate;
  final bool isOpenForScholarship;

  const PassportModel({
    required this.studentId,
    required this.fullName,
    this.bio,
    this.avatarAssetId,
    required this.completionScore,
    required this.profileVersion,
    this.education,
    this.skills = const <String>[],
    this.achievements = const <String>[],
    this.isLookingForTeammate = true,
    this.isOpenForScholarship = true,
  });

  bool get isHighQualityProfile => completionScore >= 80;

  factory PassportModel.fromJson(Map<String, dynamic> json) {
    final dynamic payload = json['data'] ?? json;
    final Map<String, dynamic> map =
        payload is Map<String, dynamic> ? payload : <String, dynamic>{};

    final dynamic skillsRaw = map['skills'];
    final List<String> skills = (skillsRaw is List)
        ? skillsRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    final dynamic achRaw = map['achievements'];
    final List<String> achievements = (achRaw is List)
        ? achRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    final dynamic eduRaw = map['education'];
    final EducationModel? education =
        eduRaw is Map<String, dynamic> ? EducationModel.fromJson(eduRaw) : null;

    return PassportModel(
      studentId: (map['studentId'] ?? '') as String,
      fullName: (map['fullName'] ?? 'Sinh viên') as String,
      bio: map['bio'] as String?,
      avatarAssetId: map['avatarAssetId'] as String?,
      completionScore: (map['completionScore'] as num?)?.toInt() ?? 0,
      profileVersion: (map['profileVersion'] as num?)?.toInt() ?? 1,
      education: education,
      skills: skills,
      achievements: achievements,
      isLookingForTeammate: (map['isLookingForTeammate'] as bool?) ?? true,
      isOpenForScholarship: (map['isOpenForScholarship'] as bool?) ?? true,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'studentId': studentId,
        'fullName': fullName,
        'bio': bio,
        'avatarAssetId': avatarAssetId,
        'completionScore': completionScore,
        'profileVersion': profileVersion,
        'education': education?.toJson(),
        'skills': skills,
        'achievements': achievements,
        'isLookingForTeammate': isLookingForTeammate,
        'isOpenForScholarship': isOpenForScholarship,
      };
}

/// Backward compatibility aliases
typedef PassportEntity = PassportModel;
typedef EducationEntity = EducationModel;
