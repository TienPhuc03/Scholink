/// Tier 1: Defensive Opportunity DTOs with all fields nullable.
class OpportunityItemDto {
  final String? id;
  final String? type;
  final String? title;
  final String? description;
  final String? organizerName;
  final String? applyMode;
  final String? registerDeadline;
  final String? submitDeadline;
  final String? fundingLevel;
  final String? competitionMode;
  final List<String>? tags;

  const OpportunityItemDto({
    this.id,
    this.type,
    this.title,
    this.description,
    this.organizerName,
    this.applyMode,
    this.registerDeadline,
    this.submitDeadline,
    this.fundingLevel,
    this.competitionMode,
    this.tags,
  });

  factory OpportunityItemDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const OpportunityItemDto();

    final dynamic tagsRaw = json['tags'];
    final List<String> parsedTags = (tagsRaw is List)
        ? tagsRaw.map((dynamic e) => e.toString()).toList()
        : <String>[];

    return OpportunityItemDto(
      id: json['id'] as String?,
      type: json['type'] as String?,
      title: json['title'] as String?,
      description: json['description'] as String?,
      organizerName: json['organizerName'] as String?,
      applyMode: json['applyMode'] as String?,
      registerDeadline: json['registerDeadline'] as String?,
      submitDeadline: json['submitDeadline'] as String?,
      fundingLevel: json['fundingLevel'] as String?,
      competitionMode: json['competitionMode'] as String?,
      tags: parsedTags,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'type': type,
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

class OpportunityListResponseDto {
  final List<OpportunityItemDto> items;
  final String? nextCursor;
  final bool hasMore;

  const OpportunityListResponseDto({
    this.items = const <OpportunityItemDto>[],
    this.nextCursor,
    this.hasMore = false,
  });

  factory OpportunityListResponseDto.fromJson(dynamic json) {
    if (json == null) return const OpportunityListResponseDto();

    final dynamic payload = (json is Map<String, dynamic>)
        ? (json['data'] ?? json)
        : json;

    if (payload is List) {
      final List<OpportunityItemDto> parsedList = payload
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => OpportunityItemDto.fromJson(item))
          .toList();
      return OpportunityListResponseDto(items: parsedList);
    }

    if (payload is Map<String, dynamic>) {
      final dynamic rawItems = payload['items'] ?? payload['opportunities'];
      final List<OpportunityItemDto> parsedList = (rawItems is List)
          ? rawItems
              .whereType<Map<String, dynamic>>()
              .map((Map<String, dynamic> item) => OpportunityItemDto.fromJson(item))
              .toList()
          : <OpportunityItemDto>[];

      return OpportunityListResponseDto(
        items: parsedList,
        nextCursor: payload['nextCursor'] as String?,
        hasMore: (payload['hasMore'] as bool?) ?? false,
      );
    }

    return const OpportunityListResponseDto();
  }
}
