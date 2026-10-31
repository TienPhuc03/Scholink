enum TeamStatus {
  forming,
  active,
  submitting,
  submitted,
  locked,
}

/// Non-nullable domain entity representing a Competition Team.
class TeamEntity {
  final String id;
  final String competitionId;
  final String name;
  final String? description;
  final String leaderId;
  final int minSize;
  final int maxSize;
  final TeamStatus status;
  final List<TeamMemberEntity> members;

  const TeamEntity({
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
      members.any((TeamMemberEntity m) => m.studentId == studentId);

  bool isLeader(String studentId) => leaderId == studentId;
}

class TeamMemberEntity {
  final String studentId;
  final String role; // LEADER, MEMBER
  final DateTime joinedAt;

  const TeamMemberEntity({
    required this.studentId,
    required this.role,
    required this.joinedAt,
  });

  bool get isLeader => role.toUpperCase() == 'LEADER';
}
