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
  final String formattedDate;

  const DeadlineInfo({
    required this.isExpired,
    required this.isDueToday,
    required this.remainingDays,
    required this.remainingHours,
    required this.statusText,
    required this.formattedDate,
  });
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
    this.isBookmarked = false,
    this.isExternalMarked = false,
  });

  bool get isCompetition => type == OpportunityType.competition;
  bool get isScholarship => type == OpportunityType.scholarship;
  bool get isExternal => applyMode.toUpperCase() == 'EXTERNAL';
  bool get isInApp => applyMode.toUpperCase() == 'IN_APP';

  String get typeDisplay => isScholarship ? 'HỌC BỔNG' : 'CUỘC THI';
  String get applyModeDisplay => isExternal ? 'ĐĂNG KÝ TẠI NGUỒN' : 'NỘP TRỰC TUYẾN';

  /// BR10 & BR11 Deadline Calculation
  DeadlineInfo get deadlineInfo {
    final DateTime now = DateTime.now();
    DateTime? deadlineDate = DateTime.tryParse(registerDeadline);

    if (deadlineDate == null) {
      return DeadlineInfo(
        isExpired: false,
        isDueToday: false,
        remainingDays: 0,
        remainingHours: 0,
        statusText: '[HẠN: $registerDeadline]',
        formattedDate: registerDeadline,
      );
    }

    // BR10: If time was not specified (00:00:00), default to 23:59:59
    if (deadlineDate.hour == 0 && deadlineDate.minute == 0 && deadlineDate.second == 0) {
      deadlineDate = DateTime(deadlineDate.year, deadlineDate.month, deadlineDate.day, 23, 59, 59);
    }

    final DateFormat formatter = DateFormat('dd/MM/yyyy HH:mm');
    final String formattedDate = formatter.format(deadlineDate.toLocal());

    // BR11: Closed when now >= registerDeadline
    if (now.isAfter(deadlineDate)) {
      return DeadlineInfo(
        isExpired: true,
        isDueToday: false,
        remainingDays: 0,
        remainingHours: 0,
        statusText: '[ĐÃ ĐÓNG ĐĂNG KÝ]',
        formattedDate: formattedDate,
      );
    }

    final Duration diff = deadlineDate.difference(now);
    final bool isDueToday = now.year == deadlineDate.year &&
        now.month == deadlineDate.month &&
        now.day == deadlineDate.day;

    if (isDueToday) {
      final DateFormat hourFmt = DateFormat('HH:mm');
      return DeadlineInfo(
        isExpired: false,
        isDueToday: true,
        remainingDays: 0,
        remainingHours: diff.inHours,
        statusText: '[HẾT HẠN HÔM NAY - ${hourFmt.format(deadlineDate)}]',
        formattedDate: formattedDate,
      );
    }

    final int days = diff.inDays;
    return DeadlineInfo(
      isExpired: false,
      isDueToday: false,
      remainingDays: days,
      remainingHours: diff.inHours % 24,
      statusText: '[CÒN $days NGÀY]',
      formattedDate: formattedDate,
    );
  }

  /// Format submitDeadline if present (BR11: Do not conflate submit deadline with register deadline)
  String? get formattedSubmitDeadline {
    if (submitDeadline == null || submitDeadline!.isEmpty) return null;
    final DateTime? d = DateTime.tryParse(submitDeadline!);
    if (d == null) return submitDeadline;
    return DateFormat('dd/MM/yyyy HH:mm').format(d.toLocal());
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
      isBookmarked: isBookmarked ?? this.isBookmarked,
      isExternalMarked: isExternalMarked ?? this.isExternalMarked,
    );
  }

  factory OpportunityModel.fromJson(Map<String, dynamic> json) {
    final String typeStr = (json['type'] ?? 'SCHOLARSHIP').toString().toUpperCase();
    final OpportunityType type = typeStr.contains('COMPETITION')
        ? OpportunityType.competition
        : OpportunityType.scholarship;

    final dynamic tagsRaw = json['tags'];
    final List<String> tags = (tagsRaw is List)
        ? tagsRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    final dynamic rulesRaw = json['eligibilityRules'] ?? json['requirements'];
    final List<String> eligibilityRules = (rulesRaw is List)
        ? rulesRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    return OpportunityModel(
      id: (json['id'] ?? json['_id'] ?? '') as String,
      type: type,
      title: (json['title'] ?? 'Cơ hội chưa đặt tên') as String,
      description: (json['description'] ?? '') as String,
      organizerName: (json['organizerName'] ?? json['organization'] ?? 'Ban tổ chức') as String,
      applyMode: (json['applyMode'] ?? 'IN_APP') as String,
      registerDeadline: (json['registerDeadline'] ?? '') as String,
      submitDeadline: json['submitDeadline'] as String?,
      fundingLevel: json['fundingLevel'] as String?,
      competitionMode: json['competitionMode'] as String?,
      tags: tags,
      sourceUrl: json['sourceUrl'] as String?,
      timezone: (json['timezone'] ?? 'Asia/Ho_Chi_Minh') as String,
      eligibilityRules: eligibilityRules,
      updatedAt: json['updatedAt']?.toString(),
      cachedAt: json['cachedAt']?.toString(),
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
        'isBookmarked': isBookmarked,
        'isExternalMarked': isExternalMarked,
      };
}

/// Backward compatibility alias
typedef OpportunityEntity = OpportunityModel;
