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

  /// Optional; same rule as the server: digits with spaces, dots or dashes, optional leading +.
  static String? phone(String v) {
    final String t = v.trim();
    if (t.isEmpty) return null;
    return RegExp(r'^\+?[0-9][0-9 .-]{7,18}[0-9]$').hasMatch(t) ? null : 'Số điện thoại không hợp lệ.';
  }

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

  /// Usual length of a bachelor's programme, used to pre-fill the end year.
  static const int defaultStudyYears = 4;

  /// End year to pre-fill for [startYear], or null while it is not a valid year yet.
  static String? defaultEndYear(String startYear) {
    final int? start = int.tryParse(startYear.trim());
    return start == null || start < 2000 || start > 2100 ? null : '${start + defaultStudyYears}';
  }

  /// GPA [text] on the [from] scale (4 or 10) converted linearly to the other one (× or ÷ 2.5),
  /// rounded to 2 decimals. Null when [text] is empty or not a GPA on [from].
  static String? convertGpa(String text, {required double from}) {
    final double? v = double.tryParse(text.trim().replaceAll(',', '.'));
    if (v == null || v <= 0 || v > from) return null;
    final double converted = from == 4 ? v * 2.5 : v / 2.5;
    return formatGpa(converted);
  }

  /// 2 decimals at most, no trailing zeros: 8.75, 3.28, 9.
  static String formatGpa(double v) =>
      v.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');

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
