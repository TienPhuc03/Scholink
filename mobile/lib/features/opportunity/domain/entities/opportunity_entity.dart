enum OpportunityType {
  scholarship,
  competition,
}

/// Non-nullable domain entity representing a Scholarship or Competition opportunity.
class OpportunityEntity {
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

  const OpportunityEntity({
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
}
