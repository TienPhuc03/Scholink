import '../../../../core/errors/failures.dart';
import '../../domain/entities/passport_entity.dart';
import '../dtos/passport_dtos.dart';

abstract final class PassportMapper {
  static PassportEntity toEntity(PassportDetailDto dto) {
    final String studentId = dto.studentId ?? '';
    final String fullName = dto.fullName ?? 'Sinh viên Scholink';

    if (studentId.isEmpty) {
      throw const ValidationFailure(message: 'Dữ liệu Passport thiếu mã định danh sinh viên.');
    }

    return PassportEntity(
      studentId: studentId,
      fullName: fullName,
      bio: dto.bio,
      avatarAssetId: dto.avatarAssetId,
      completionScore: dto.completionScore ?? 0,
      profileVersion: dto.profileVersion ?? 1,
      education: dto.education != null ? _toEducationEntity(dto.education!) : null,
      skills: dto.skills ?? const <String>[],
      achievements: dto.achievements ?? const <String>[],
      isLookingForTeammate: dto.isLookingForTeammate ?? true,
      isOpenForScholarship: dto.isOpenForScholarship ?? true,
    );
  }

  static EducationEntity _toEducationEntity(EducationDetailDto dto) {
    return EducationEntity(
      institution: dto.institution ?? 'Trường Đại học',
      major: dto.major ?? 'Chuyên ngành',
      startYear: dto.startYear ?? DateTime.now().year - 2,
      endYear: dto.endYear,
      gpa: dto.gpa,
      gpaScale: dto.gpaScale ?? 4.0,
    );
  }
}
