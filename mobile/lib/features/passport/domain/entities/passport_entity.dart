/// Non-nullable domain entity representing student's verified digital passport.
class PassportEntity {
  final String studentId;
  final String fullName;
  final String? bio;
  final String? avatarAssetId;
  final int completionScore;
  final int profileVersion;
  final EducationEntity? education;
  final List<String> skills;
  final List<String> achievements;
  final bool isLookingForTeammate;
  final bool isOpenForScholarship;

  const PassportEntity({
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
}

class EducationEntity {
  final String institution;
  final String major;
  final int startYear;
  final int? endYear;
  final double? gpa;
  final double? gpaScale;

  const EducationEntity({
    required this.institution,
    required this.major,
    required this.startYear,
    this.endYear,
    this.gpa,
    this.gpaScale,
  });

  String get gpaDisplay => gpa != null ? '$gpa / ${gpaScale ?? 4.0}' : 'Chưa cập nhật GPA';
}
