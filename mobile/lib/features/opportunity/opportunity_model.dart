import 'package:intl/intl.dart';

enum OpportunityType {
  scholarship,
  competition,
}

enum ApplyMode {
  inApp,
  external,
}

/// Information computed for BR10 & BR11 deadline countdowns.
class DeadlineInfo {
  final bool isExpired;
  final bool isDueToday;
  final int remainingDays;
  final int remainingHours;
  final String statusText;

  /// Deadline in the device's own time, e.g. `31/12/2026 23:59`.
  final String formattedDate;

  /// Device UTC offset the date above is shown in, e.g. `GMT+7`.
  final String deviceZoneLabel;

  const DeadlineInfo({
    required this.isExpired,
    required this.isDueToday,
    required this.remainingDays,
    required this.remainingHours,
    required this.statusText,
    required this.formattedDate,
    this.deviceZoneLabel = '',
  });
}

/// `GMT+7`, `GMT-3:30`... for the device's offset at [at].
String deviceZoneLabel([DateTime? at]) {
  final Duration offset = (at ?? DateTime.now()).toLocal().timeZoneOffset;
  final String sign = offset.isNegative ? '-' : '+';
  final int minutes = offset.inMinutes.abs();
  final int h = minutes ~/ 60;
  final int m = minutes % 60;
  return m == 0 ? 'GMT$sign$h' : 'GMT$sign$h:${m.toString().padLeft(2, '0')}';
}

/// Parses an ISO deadline. BR10: a date without a time ("2026-12-31") closes at the end of that
/// day (23:59:59 device time). Full timestamps from the server (UTC) are taken as they are, even
/// when they happen to be exactly 00:00 UTC.
DateTime? parseDeadline(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final String value = raw.trim();
  final DateTime? parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  final bool dateOnly = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value);
  if (dateOnly) return DateTime(parsed.year, parsed.month, parsed.day, 23, 59, 59);
  return parsed.toLocal();
}

/// Unified Opportunity Model for MVVM Architecture.
/// Complies with FR-OPP-01, FR-OPP-02, FR-OPP-04, FR-OPP-06, BR10, BR11, and FR-APP-04.
class OpportunityModel {
  final String id;
  final OpportunityType type;
  final String title;
  final String description;
  final String organizerName;
  final String applyMode; // 'IN_APP' or 'EXTERNAL'
  final String registerDeadline;
  final String? submitDeadline;
  final String? fundingLevel; // 'FULL', 'PARTIAL', etc.
  final String? competitionMode; // 'TEAM', 'INDIVIDUAL', etc.
  final List<String> tags;
  final String? sourceUrl;
  final String timezone;
  final List<String> eligibilityRules;
  final String? updatedAt;
  final String? cachedAt;

  /// Server version of the opportunity; a deadline extension raises it (NOTI-02).
  final int? version;
  final bool isBookmarked;
  final bool isExternalMarked;

  const OpportunityModel({
    required this.id,
    required this.type,
    required this.title,
    required this.description,
    required this.organizerName,
    required this.applyMode,
    required this.registerDeadline,
    this.submitDeadline,
    this.fundingLevel,
    this.competitionMode,
    this.tags = const <String>[],
    this.sourceUrl,
    this.timezone = 'Asia/Ho_Chi_Minh',
    this.eligibilityRules = const <String>[],
    this.updatedAt,
    this.cachedAt,
    this.version,
    this.isBookmarked = false,
    this.isExternalMarked = false,
  });

  bool get isCompetition => type == OpportunityType.competition;
  bool get isScholarship => type == OpportunityType.scholarship;
  bool get isExternal => applyMode.toUpperCase() == 'EXTERNAL';
  bool get isInApp => applyMode.toUpperCase() == 'IN_APP';
  bool get isTeamCompetition => (competitionMode ?? '').toUpperCase() == 'TEAM';

  String get typeDisplay => isScholarship ? 'HỌC BỔNG' : 'CUỘC THI';
  String get applyModeDisplay => isExternal ? 'ĐĂNG KÝ TẠI NGUỒN' : 'NỘP TRỰC TUYẾN';

  /// Register deadline in device time (BR10 applied), or null when the value cannot be read.
  DateTime? get registerDeadlineAt => parseDeadline(registerDeadline);

  /// True when the source publishes its deadline in another timezone than the device's.
  bool get deadlineZoneDiffersFromDevice {
    final DateTime? d = registerDeadlineAt;
    if (d == null) return false;
    return _zoneOffsets[timezone] != null && _zoneOffsets[timezone] != d.timeZoneOffset.inMinutes;
  }

  /// Fixed offsets of the timezones the catalog uses (no DST in Asia); unknown zones are not
  /// compared, the source timezone is still shown next to the date.
  static const Map<String, int> _zoneOffsets = <String, int>{
    'Asia/Ho_Chi_Minh': 420,
    'Asia/Saigon': 420,
    'Asia/Bangkok': 420,
    'Asia/Jakarta': 420,
    'Asia/Singapore': 480,
    'Asia/Shanghai': 480,
    'Asia/Hong_Kong': 480,
    'Asia/Taipei': 480,
    'Asia/Seoul': 540,
    'Asia/Tokyo': 540,
    'UTC': 0,
    'Etc/UTC': 0,
  };

  /// BR10 & BR11 Deadline Calculation
  DeadlineInfo deadlineInfoAt(DateTime now) {
    final DateTime? deadlineDate = registerDeadlineAt;
    final DateTime localNow = now.toLocal();

    if (deadlineDate == null) {
      return DeadlineInfo(
        isExpired: false,
        isDueToday: false,
        remainingDays: 0,
        remainingHours: 0,
        statusText: '[CHƯA RÕ HẠN]',
        formattedDate: registerDeadline.isEmpty ? 'Chưa công bố' : registerDeadline,
      );
    }

    final String formattedDate = DateFormat('dd/MM/yyyy HH:mm').format(deadlineDate);
    final String zone = deviceZoneLabel(deadlineDate);

    // BR11: Closed when now >= registerDeadline (đúng thời điểm hạn cũng là đã đóng)
    if (!localNow.isBefore(deadlineDate)) {
      return DeadlineInfo(
        isExpired: true,
        isDueToday: false,
        remainingDays: 0,
        remainingHours: 0,
        statusText: '[ĐÃ ĐÓNG ĐĂNG KÝ]',
        formattedDate: formattedDate,
        deviceZoneLabel: zone,
      );
    }

    final Duration diff = deadlineDate.difference(localNow);
    final bool isDueToday = localNow.year == deadlineDate.year &&
        localNow.month == deadlineDate.month &&
        localNow.day == deadlineDate.day;

    if (isDueToday) {
      return DeadlineInfo(
        isExpired: false,
        isDueToday: true,
        remainingDays: 0,
        remainingHours: diff.inHours,
        statusText: '[HẾT HẠN HÔM NAY - ${DateFormat('HH:mm').format(deadlineDate)}]',
        formattedDate: formattedDate,
        deviceZoneLabel: zone,
      );
    }

    // Count calendar days, so "tomorrow 08:00" reads 1 day even when it is 20 hours away.
    final DateTime today = DateTime(localNow.year, localNow.month, localNow.day);
    final DateTime deadlineDay = DateTime(deadlineDate.year, deadlineDate.month, deadlineDate.day);
    final int days = deadlineDay.difference(today).inDays;
    return DeadlineInfo(
      isExpired: false,
      isDueToday: false,
      remainingDays: days,
      remainingHours: diff.inHours % 24,
      statusText: '[CÒN $days NGÀY]',
      formattedDate: formattedDate,
      deviceZoneLabel: zone,
    );
  }

  DeadlineInfo get deadlineInfo => deadlineInfoAt(DateTime.now());

  /// Format submitDeadline if present (BR11: Do not conflate submit deadline with register deadline)
  String? get formattedSubmitDeadline {
    if (submitDeadline == null || submitDeadline!.isEmpty) return null;
    final DateTime? d = parseDeadline(submitDeadline);
    if (d == null) return submitDeadline;
    return DateFormat('dd/MM/yyyy HH:mm').format(d);
  }

  /// `updatedAt` of the server record in device time, for the "dữ liệu cập nhật lúc" notice.
  String? get formattedUpdatedAt {
    final DateTime? d = DateTime.tryParse(updatedAt ?? '');
    return d == null ? null : DateFormat('dd/MM/yyyy HH:mm').format(d.toLocal());
  }

  OpportunityModel copyWith({
    String? id,
    OpportunityType? type,
    String? title,
    String? description,
    String? organizerName,
    String? applyMode,
    String? registerDeadline,
    String? submitDeadline,
    String? fundingLevel,
    String? competitionMode,
    List<String>? tags,
    String? sourceUrl,
    String? timezone,
    List<String>? eligibilityRules,
    String? updatedAt,
    String? cachedAt,
    int? version,
    bool? isBookmarked,
    bool? isExternalMarked,
  }) {
    return OpportunityModel(
      id: id ?? this.id,
      type: type ?? this.type,
      title: title ?? this.title,
      description: description ?? this.description,
      organizerName: organizerName ?? this.organizerName,
      applyMode: applyMode ?? this.applyMode,
      registerDeadline: registerDeadline ?? this.registerDeadline,
      submitDeadline: submitDeadline ?? this.submitDeadline,
      fundingLevel: fundingLevel ?? this.fundingLevel,
      competitionMode: competitionMode ?? this.competitionMode,
      tags: tags ?? this.tags,
      sourceUrl: sourceUrl ?? this.sourceUrl,
      timezone: timezone ?? this.timezone,
      eligibilityRules: eligibilityRules ?? this.eligibilityRules,
      updatedAt: updatedAt ?? this.updatedAt,
      cachedAt: cachedAt ?? this.cachedAt,
      version: version ?? this.version,
      isBookmarked: isBookmarked ?? this.isBookmarked,
      isExternalMarked: isExternalMarked ?? this.isExternalMarked,
    );
  }

  static String? _str(dynamic v) {
    if (v == null) return null;
    final String s = v.toString();
    return s.isEmpty ? null : s;
  }

  static const Map<String, String> _ruleFieldNames = <String, String>{
    'gpa': 'GPA',
    'minGpa': 'GPA',
    'ielts': 'IELTS',
    'requiredIelts': 'IELTS',
    'yearOfStudy': 'Năm học',
    'major': 'Ngành học',
    'university': 'Trường',
  };

  /// Server eligibility rules are objects ({fieldKey, operator, value, type}); older payloads and
  /// the cache use plain strings.
  static String _describeRule(dynamic rule) {
    if (rule is! Map) return rule.toString();
    final String key = rule['fieldKey']?.toString() ?? '';
    final String field = _ruleFieldNames[key] ?? key;
    final dynamic value = rule['value'];
    final String shown = value is List ? value.join(', ') : (value?.toString() ?? '');
    final String sentence = switch (rule['operator']?.toString()) {
      'GTE' => '$field từ $shown trở lên',
      'LTE' => '$field không quá $shown',
      'EQ' => '$field: $shown',
      'IN' => '$field thuộc: $shown',
      'EXISTS' => 'Có $field',
      _ => '$field $shown'.trim(),
    };
    return rule['type']?.toString() == 'SOFT' ? '$sentence (ưu tiên)' : sentence;
  }

  factory OpportunityModel.fromJson(Map<String, dynamic> json) {
    final String typeStr = (json['type'] ?? 'SCHOLARSHIP').toString().toUpperCase();
    final OpportunityType type =
        typeStr.contains('COMPETITION') ? OpportunityType.competition : OpportunityType.scholarship;

    final dynamic tagsRaw = json['tags'];
    final List<String> tags =
        (tagsRaw is List) ? tagsRaw.map((dynamic e) => e.toString()).toList() : <String>[];

    final List<String> eligibilityRules = <String>[];
    final dynamic rulesRaw = json['eligibilityRules'];
    if (rulesRaw is List) eligibilityRules.addAll(rulesRaw.map(_describeRule));
    final dynamic requirements = json['requirements'];
    if (requirements is List) {
      eligibilityRules.addAll(requirements.map((dynamic e) => e.toString()));
    } else if (requirements is String && requirements.trim().isNotEmpty) {
      eligibilityRules.addAll(
        requirements.split('\n').map((String l) => l.trim()).where((String l) => l.isNotEmpty),
      );
    }
    if (eligibilityRules.isEmpty) {
      final num? minGpa = num.tryParse('${json['minGpa'] ?? ''}');
      final num? ielts = num.tryParse('${json['requiredIelts'] ?? ''}');
      if (minGpa != null && minGpa > 0) eligibilityRules.add('GPA từ $minGpa trở lên');
      if (ielts != null && ielts > 0) eligibilityRules.add('IELTS từ $ielts trở lên');
    }

    return OpportunityModel(
      id: (json['id'] ?? json['_id'] ?? '').toString(),
      type: type,
      title: _str(json['title']) ?? 'Cơ hội chưa đặt tên',
      description: _str(json['description']) ?? '',
      organizerName: _str(json['organizerName']) ?? _str(json['organization']) ?? 'Ban tổ chức',
      applyMode: (_str(json['applyMode']) ?? 'IN_APP').toUpperCase(),
      registerDeadline: _str(json['registerDeadline']) ?? '',
      submitDeadline: _str(json['submitDeadline']),
      fundingLevel: _str(json['fundingLevel']),
      competitionMode: _str(json['competitionMode']),
      tags: tags,
      sourceUrl: _str(json['sourceUrl']),
      timezone: _str(json['timezone']) ?? 'Asia/Ho_Chi_Minh',
      eligibilityRules: eligibilityRules,
      updatedAt: _str(json['updatedAt']),
      cachedAt: _str(json['cachedAt']),
      version: int.tryParse('${json['version'] ?? ''}'),
      isBookmarked: json['isBookmarked'] == true,
      isExternalMarked: json['isExternalMarked'] == true,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'type': isCompetition ? 'COMPETITION' : 'SCHOLARSHIP',
        'title': title,
        'description': description,
        'organizerName': organizerName,
        'applyMode': applyMode,
        'registerDeadline': registerDeadline,
        'submitDeadline': submitDeadline,
        'fundingLevel': fundingLevel,
        'competitionMode': competitionMode,
        'tags': tags,
        'sourceUrl': sourceUrl,
        'timezone': timezone,
        'eligibilityRules': eligibilityRules,
        'updatedAt': updatedAt,
        'cachedAt': cachedAt,
        'version': version,
        'isBookmarked': isBookmarked,
        'isExternalMarked': isExternalMarked,
      };
}

/// Backward compatibility alias
typedef OpportunityEntity = OpportunityModel;
