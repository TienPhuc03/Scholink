import '../auth/auth_validators.dart';

/// Client-side checks mirroring `UpdatePassportDtoSchema` and `CertificateInputSchema`.
abstract final class PassportValidators {
  static const int maxBio = 500;
  static const int maxSkills = 20;
  static const int maxSkillLength = 60;
  static const int maxAchievements = 20;
  static const int maxAchievementLength = 300;
  static const int maxCertificates = 20;

  static String? fullName(String v) => AuthValidators.fullName(v);

  static String? bio(String v) => v.trim().length > maxBio ? 'Giới thiệu tối đa $maxBio ký tự.' : null;

  static String? regionCode(String v) => v.trim().length > 20 ? 'Mã khu vực tối đa 20 ký tự.' : null;

  /// Education is optional, but once started it needs institution, major and a valid start year.
  static ({String? institution, String? major, String? startYear, String? endYear, String? gpa}) education({
    required String institution,
    required String major,
    required String startYear,
    required String endYear,
    required String gpa,
    required double gpaScale,
  }) {
    final bool any = <String>[institution, major, startYear, endYear, gpa].any((String s) => s.trim().isNotEmpty);
    if (!any) return (institution: null, major: null, startYear: null, endYear: null, gpa: null);

    final int? start = int.tryParse(startYear.trim());
    final int? end = endYear.trim().isEmpty ? null : int.tryParse(endYear.trim());
    final double? gpaValue = gpa.trim().isEmpty ? null : double.tryParse(gpa.trim().replaceAll(',', '.'));

    return (
      institution: institution.trim().isEmpty ? 'Nhập tên trường.' : null,
      major: major.trim().isEmpty ? 'Nhập chuyên ngành.' : null,
      startYear: (start == null || start < 2000 || start > 2100) ? 'Năm từ 2000 đến 2100.' : null,
      endYear: endYear.trim().isEmpty
          ? null
          : (end == null || end < 2000 || end > 2100)
              ? 'Năm từ 2000 đến 2100.'
              : (start != null && end < start)
                  ? 'Không được trước năm bắt đầu.'
                  : null,
      gpa: gpa.trim().isEmpty
          ? null
          : (gpaValue == null || gpaValue <= 0 || gpaValue > gpaScale)
              ? 'GPA phải lớn hơn 0 và không vượt quá ${gpaScale.toStringAsFixed(0)}.'
              : null,
    );
  }

  static String? newSkill(String v, List<String> existing) {
    final String s = v.trim();
    if (s.isEmpty) return 'Nhập tên kỹ năng.';
    if (s.length > maxSkillLength) return 'Kỹ năng tối đa $maxSkillLength ký tự.';
    if (existing.length >= maxSkills) return 'Tối đa $maxSkills kỹ năng.';
    if (existing.any((String e) => e.toLowerCase() == s.toLowerCase())) return 'Kỹ năng này đã có.';
    return null;
  }

  static String? newAchievement(String v, List<String> existing) {
    final String s = v.trim();
    if (s.isEmpty) return 'Nhập nội dung thành tích.';
    if (s.length > maxAchievementLength) return 'Thành tích tối đa $maxAchievementLength ký tự.';
    if (existing.length >= maxAchievements) return 'Tối đa $maxAchievements thành tích.';
    return null;
  }

  static String? certificateName(String v) {
    final String s = v.trim();
    if (s.isEmpty) return 'Nhập tên chứng chỉ.';
    if (s.length > 200) return 'Tên chứng chỉ tối đa 200 ký tự.';
    return null;
  }

  static String? certificateDates(DateTime? issued, DateTime? expiry, {DateTime? now}) {
    if (issued == null) return 'Chọn ngày cấp.';
    if (issued.isAfter(now ?? DateTime.now())) return 'Ngày cấp không được ở tương lai.';
    if (expiry != null && expiry.isBefore(issued)) return 'Ngày hết hạn phải sau ngày cấp.';
    return null;
  }
}
