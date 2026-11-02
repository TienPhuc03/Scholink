enum TeamStatus {
  forming,
  active,
  submitting,
  submitted,
  locked,
}

/// Unified Team Member Model for MVVM Architecture.
class TeamMemberModel {
  final String studentId;
  final String role; // LEADER, MEMBER
  final DateTime joinedAt;

  const TeamMemberModel({
    required this.studentId,
    required this.role,
    required this.joinedAt,
  });

  bool get isLeader => role.toUpperCase() == 'LEADER';

  factory TeamMemberModel.fromJson(Map<String, dynamic> json) {
    return TeamMemberModel(
      studentId: (json['studentId'] ?? json['userId'] ?? '') as String,
      role: (json['role'] ?? 'MEMBER') as String,
      joinedAt: json['joinedAt'] != null
          ? DateTime.tryParse(json['joinedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'studentId': studentId,
        'role': role,
        'joinedAt': joinedAt.toIso8601String(),
      };
}

/// Unified Team Model for MVVM Architecture.
class TeamModel {
  final String id;
  final String competitionId;
  final String name;
  final String? description;
  final String leaderId;
  final int minSize;
  final int maxSize;
  final TeamStatus status;
  final List<TeamMemberModel> members;

  const TeamModel({
    required this.id,
    required this.competitionId,
    required this.name,
    this.description,
    required this.leaderId,
    required this.minSize,
    required this.maxSize,
    required this.status,
    required this.members,
  });

  int get memberCount => members.length;
  bool get isFull => memberCount >= maxSize;
  bool get isForming => status == TeamStatus.forming;
  bool get isActive => status == TeamStatus.active;
  bool get isSubmitting => status == TeamStatus.submitting;

  String get slotDisplay => '$memberCount/$maxSize';

  String get statusDisplay => switch (status) {
        TeamStatus.forming => 'Đang tuyển (FORMING)',
        TeamStatus.active => 'Đủ điều kiện (ACTIVE)',
        TeamStatus.submitting => 'Đang nộp bài (SUBMITTING)',
        TeamStatus.submitted => 'Đã nộp bài (SUBMITTED)',
        TeamStatus.locked => 'Đã khóa (LOCKED)',
      };

  bool isMember(String studentId) =>
      members.any((TeamMemberModel m) => m.studentId == studentId);

  bool isLeader(String studentId) => leaderId == studentId;

  factory TeamModel.fromJson(Map<String, dynamic> json) {
    final String rawStatus = (json['status'] ?? 'FORMING').toString().toUpperCase();
    final TeamStatus status = switch (rawStatus) {
      'ACTIVE' => TeamStatus.active,
      'SUBMITTING' => TeamStatus.submitting,
      'SUBMITTED' => TeamStatus.submitted,
      'LOCKED' => TeamStatus.locked,
      _ => TeamStatus.forming,
    };

    final dynamic rawMembers = json['members'];
    final List<TeamMemberModel> members = (rawMembers is List)
        ? rawMembers
            .whereType<Map<String, dynamic>>()
            .map((Map<String, dynamic> item) => TeamMemberModel.fromJson(item))
            .toList()
        : <TeamMemberModel>[];

    return TeamModel(
      id: (json['id'] ?? '') as String,
      competitionId: (json['competitionId'] ?? '') as String,
      name: (json['name'] ?? 'Đội chưa đặt tên') as String,
      description: json['description'] as String?,
      leaderId: (json['leaderId'] ?? '') as String,
      minSize: (json['minSize'] as num?)?.toInt() ?? 2,
      maxSize: (json['maxSize'] as num?)?.toInt() ?? 5,
      status: status,
      members: members,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'competitionId': competitionId,
        'name': name,
        'description': description,
        'leaderId': leaderId,
        'minSize': minSize,
        'maxSize': maxSize,
        'status': status.name.toUpperCase(),
        'members': members.map((TeamMemberModel m) => m.toJson()).toList(),
      };
}

/// Backward compatibility aliases
typedef TeamEntity = TeamModel;
typedef TeamMemberEntity = TeamMemberModel;
