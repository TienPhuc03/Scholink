/// Tier 1: Defensive Passport DTOs with all fields nullable.
class PassportDetailDto {
  final String? studentId;
  final String? fullName;
  final String? bio;
  final String? avatarAssetId;
  final int? completionScore;
  final int? profileVersion;
  final EducationDetailDto? education;
  final List<String>? skills;
  final List<String>? achievements;
  final bool? isLookingForTeammate;
  final bool? isOpenForScholarship;

  const PassportDetailDto({
    this.studentId,
    this.fullName,
    this.bio,
    this.avatarAssetId,
    this.completionScore,
    this.profileVersion,
    this.education,
    this.skills,
    this.achievements,
    this.isLookingForTeammate,
    this.isOpenForScholarship,
  });

  factory PassportDetailDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const PassportDetailDto();

    final dynamic payload = json['data'] ?? json;
    if (payload is! Map<String, dynamic>) return const PassportDetailDto();

    final dynamic skillsRaw = payload['skills'];
    final List<String> parsedSkills = (skillsRaw is List)
        ? skillsRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    final dynamic achRaw = payload['achievements'];
    final List<String> parsedAchievements = (achRaw is List)
        ? achRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    return PassportDetailDto(
      studentId: payload['studentId'] as String?,
      fullName: payload['fullName'] as String?,
      bio: payload['bio'] as String?,
      avatarAssetId: payload['avatarAssetId'] as String?,
      completionScore: (payload['completionScore'] as num?)?.toInt(),
      profileVersion: (payload['profileVersion'] as num?)?.toInt(),
      education: payload['education'] != null
          ? EducationDetailDto.fromJson(payload['education'] as Map<String, dynamic>?)
          : null,
      skills: parsedSkills,
      achievements: parsedAchievements,
      isLookingForTeammate: payload['isLookingForTeammate'] as bool?,
      isOpenForScholarship: payload['isOpenForScholarship'] as bool?,
    );
  }
}

class EducationDetailDto {
  final String? institution;
  final String? major;
  final int? startYear;
  final int? endYear;
  final double? gpa;
  final double? gpaScale;

  const EducationDetailDto({
    this.institution,
    this.major,
    this.startYear,
    this.endYear,
    this.gpa,
    this.gpaScale,
  });

  factory EducationDetailDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const EducationDetailDto();
    return EducationDetailDto(
      institution: json['institution'] as String?,
      major: json['major'] as String?,
      startYear: (json['startYear'] as num?)?.toInt(),
      endYear: (json['endYear'] as num?)?.toInt(),
      gpa: (json['gpa'] as num?)?.toDouble(),
      gpaScale: (json['gpaScale'] as num?)?.toDouble(),
    );
  }
}
