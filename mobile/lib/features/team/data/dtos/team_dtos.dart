/// Tier 1: Defensive Team DTOs with all fields nullable.
class TeamDetailDto {
  final String? id;
  final String? competitionId;
  final String? name;
  final String? description;
  final String? leaderId;
  final int? minSize;
  final int? maxSize;
  final String? status;
  final List<TeamMemberDto>? members;

  const TeamDetailDto({
    this.id,
    this.competitionId,
    this.name,
    this.description,
    this.leaderId,
    this.minSize,
    this.maxSize,
    this.status,
    this.members,
  });

  factory TeamDetailDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const TeamDetailDto();

    final dynamic membersRaw = json['members'];
    final List<TeamMemberDto> parsedMembers = (membersRaw is List)
        ? membersRaw
            .whereType<Map<String, dynamic>>()
            .map((Map<String, dynamic> m) => TeamMemberDto.fromJson(m))
            .toList()
        : <TeamMemberDto>[];

    return TeamDetailDto(
      id: json['id'] as String?,
      competitionId: json['competitionId'] as String?,
      name: json['name'] as String?,
      description: json['description'] as String?,
      leaderId: json['leaderId'] as String?,
      minSize: (json['minSize'] as num?)?.toInt(),
      maxSize: (json['maxSize'] as num?)?.toInt(),
      status: json['status'] as String?,
      members: parsedMembers,
    );
  }
}

class TeamMemberDto {
  final String? studentId;
  final String? role;
  final String? joinedAt;

  const TeamMemberDto({
    this.studentId,
    this.role,
    this.joinedAt,
  });

  factory TeamMemberDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const TeamMemberDto();
    return TeamMemberDto(
      studentId: json['studentId'] as String?,
      role: json['role'] as String?,
      joinedAt: json['joinedAt'] as String?,
    );
  }
}

class CreateTeamRequestDto {
  final String competitionId;
  final String name;
  final String? description;
  final int minSize;
  final int maxSize;

  const CreateTeamRequestDto({
    required this.competitionId,
    required this.name,
    this.description,
    this.minSize = 2,
    this.maxSize = 5,
  });

  Map<String, dynamic> toJson() => <String, dynamic>{
        'competitionId': competitionId,
        'name': name,
        'description': description,
        'minSize': minSize,
        'maxSize': maxSize,
      };
}
