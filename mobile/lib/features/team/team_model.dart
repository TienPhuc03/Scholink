enum TeamStatus {
  forming,
  active,
  submitting,
  submitted,
  locked,
}

enum JoinRequestStatus {
  pending,
  accepted,
  rejected,
  withdrawn,
}

/// Unified JoinRequest Model matching Collaboration Microservice JoinRequest entity.
class JoinRequestModel {
  final String id;
  final String teamId;
  final String competitionId;
  final String applicantId;
  final String? message;
  final JoinRequestStatus status;
  final DateTime appliedAt;
  final DateTime? reviewedAt;
  final String? reviewedBy;

  const JoinRequestModel({
    required this.id,
    required this.teamId,
    required this.competitionId,
    required this.applicantId,
    this.message,
    required this.status,
    required this.appliedAt,
    this.reviewedAt,
    this.reviewedBy,
  });

  bool get isPending => status == JoinRequestStatus.pending;
  bool get isAccepted => status == JoinRequestStatus.accepted;
  bool get isRejected => status == JoinRequestStatus.rejected;
  bool get isWithdrawn => status == JoinRequestStatus.withdrawn;

  String get statusDisplay => switch (status) {
        JoinRequestStatus.pending => 'Đang chờ duyệt',
        JoinRequestStatus.accepted => 'Đã chấp nhận',
        JoinRequestStatus.rejected => 'Bị từ chối',
        JoinRequestStatus.withdrawn => 'Đã rút yêu cầu',
      };

  factory JoinRequestModel.fromJson(Map<String, dynamic> json) {
    final String rawStatus = (json['status'] ?? 'PENDING').toString().toUpperCase();
    final JoinRequestStatus status = switch (rawStatus) {
      'ACCEPTED' => JoinRequestStatus.accepted,
      'REJECTED' => JoinRequestStatus.rejected,
      'WITHDRAWN' => JoinRequestStatus.withdrawn,
      _ => JoinRequestStatus.pending,
    };

    return JoinRequestModel(
      id: (json['id'] ?? json['_id'] ?? '') as String,
      teamId: (json['teamId'] ?? '') as String,
      competitionId: (json['competitionId'] ?? '') as String,
      applicantId: (json['applicantId'] ?? '') as String,
      message: json['message'] as String?,
      status: status,
      appliedAt: json['appliedAt'] != null
          ? DateTime.tryParse(json['appliedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      reviewedAt: json['reviewedAt'] != null
          ? DateTime.tryParse(json['reviewedAt'].toString())
          : null,
      reviewedBy: json['reviewedBy'] as String?,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'teamId': teamId,
        'competitionId': competitionId,
        'applicantId': applicantId,
        'message': message,
        'status': status.name.toUpperCase(),
        'appliedAt': appliedAt.toIso8601String(),
        'reviewedAt': reviewedAt?.toIso8601String(),
        'reviewedBy': reviewedBy,
      };
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
  int get remainingSlots => (maxSize - memberCount).clamp(0, maxSize);
  bool get isForming => status == TeamStatus.forming;
  bool get isActive => status == TeamStatus.active;
  bool get isSubmitting => status == TeamStatus.submitting;
  bool get isSubmitted => status == TeamStatus.submitted;

  bool get isJoinable => !isFull && (isForming || isActive);

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
      id: (json['id'] ?? json['_id'] ?? '') as String,
      competitionId: (json['competitionId'] ?? '') as String,
      name: (json['name'] ?? 'Đội thi') as String,
      description: json['description'] as String?,
      leaderId: (json['leaderId'] ?? '') as String,
      minSize: (json['minSize'] ?? 2) as int,
      maxSize: (json['maxSize'] ?? 5) as int,
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
