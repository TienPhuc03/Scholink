enum OpportunityType {
  scholarship,
  competition,
}

/// Unified Opportunity Model for MVVM Architecture.
class OpportunityModel {
  final String id;
  final OpportunityType type;
  final String title;
  final String description;
  final String organizerName;
  final String applyMode;
  final String registerDeadline;
  final String? submitDeadline;
  final String? fundingLevel;
  final String? competitionMode;
  final List<String> tags;

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
  });

  bool get isCompetition => type == OpportunityType.competition;
  bool get isScholarship => type == OpportunityType.scholarship;
  String get typeDisplay => isScholarship ? 'HỌC BỔNG' : 'CUỘC THI';

  factory OpportunityModel.fromJson(Map<String, dynamic> json) {
    final String typeStr = (json['type'] ?? 'SCHOLARSHIP').toString().toUpperCase();
    final OpportunityType type = typeStr.contains('COMPETITION')
        ? OpportunityType.competition
        : OpportunityType.scholarship;

    final dynamic tagsRaw = json['tags'];
    final List<String> tags = (tagsRaw is List)
        ? tagsRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    return OpportunityModel(
      id: (json['id'] ?? '') as String,
      type: type,
      title: (json['title'] ?? 'Cơ hội chưa đặt tên') as String,
      description: (json['description'] ?? '') as String,
      organizerName: (json['organizerName'] ?? json['organization'] ?? 'Ban tổ chức') as String,
      applyMode: (json['applyMode'] ?? 'ONLINE') as String,
      registerDeadline: (json['registerDeadline'] ?? '') as String,
      submitDeadline: json['submitDeadline'] as String?,
      fundingLevel: json['fundingLevel'] as String?,
      competitionMode: json['competitionMode'] as String?,
      tags: tags,
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
      };
}

/// Backward compatibility alias
typedef OpportunityEntity = OpportunityModel;
