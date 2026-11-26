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

/// Tóm tắt thông tin hồ sơ ứng viên (T4)
class ApplicantSummary {
  final String fullName;
  final String avatarUrl;
  final String institution;
  final String major;
  final int? startYear;
  final int? endYear;
  final double? gpa;
  final double? gpaScale;

  const ApplicantSummary({
    this.fullName = '',
    this.avatarUrl = '',
    this.institution = '',
    this.major = '',
    this.startYear,
    this.endYear,
    this.gpa,
    this.gpaScale,
  });

  factory ApplicantSummary.fromJson(Map<String, dynamic> json) {
    return ApplicantSummary(
      fullName: (json['fullName'] ?? '') as String,
      avatarUrl: (json['avatarUrl'] ?? '') as String,
      institution: (json['institution'] ?? '') as String,
      major: (json['major'] ?? '') as String,
      startYear: json['startYear'] as int?,
      endYear: json['endYear'] as int?,
      gpa: (json['gpa'] is num) ? (json['gpa'] as num).toDouble() : null,
      gpaScale: (json['gpaScale'] is num)
          ? (json['gpaScale'] as num).toDouble()
          : null,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'fullName': fullName,
        'avatarUrl': avatarUrl,
        'institution': institution,
        'major': major,
        'startYear': startYear,
        'endYear': endYear,
        'gpa': gpa,
        'gpaScale': gpaScale,
      };

  String get educationDisplay {
    final List<String> parts = <String>[];
    if (institution.isNotEmpty) parts.add(institution);
    if (major.isNotEmpty) parts.add(major);
    if (startYear != null) parts.add('Khóa $startYear');
    if (gpa != null) {
      parts.add('GPA: $gpa${gpaScale != null ? '/$gpaScale' : ''}');
    }
    return parts.join(' · ');
  }
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
  final ApplicantSummary? applicant;

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
    this.applicant,
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
    final String rawStatus =
        (json['status'] ?? 'PENDING').toString().toUpperCase();
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
      applicant: json['applicant'] != null && json['applicant'] is Map
          ? ApplicantSummary.fromJson(json['applicant'] as Map<String, dynamic>)
          : null,
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
        if (applicant != null) 'applicant': applicant!.toJson(),
      };
}

/// Unified Team Member Model for MVVM Architecture.
class TeamMemberModel {
  final String studentId;
  final String role; // LEADER, MEMBER
  final DateTime joinedAt;
  final String? fullName;
  final String? avatarUrl;

  const TeamMemberModel({
    required this.studentId,
    required this.role,
    required this.joinedAt,
    this.fullName,
    this.avatarUrl,
  });

  bool get isLeader => role.toUpperCase() == 'LEADER';

  factory TeamMemberModel.fromJson(Map<String, dynamic> json) {
    return TeamMemberModel(
      studentId: (json['studentId'] ?? json['userId'] ?? '') as String,
      role: (json['role'] ?? 'MEMBER') as String,
      fullName: json['fullName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      joinedAt: json['joinedAt'] != null
          ? DateTime.tryParse(json['joinedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'studentId': studentId,
        'role': role,
        'joinedAt': joinedAt.toIso8601String(),
        if (fullName != null) 'fullName': fullName,
        if (avatarUrl != null) 'avatarUrl': avatarUrl,
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
  final String? customBannerImageUrl;
  final String? customAvatarImageUrl;

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
    this.customBannerImageUrl,
    this.customAvatarImageUrl,
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
        TeamStatus.forming => 'Đang tuyển',
        TeamStatus.active => 'Đang hoạt động',
        TeamStatus.submitting => 'Đang nộp bài',
        TeamStatus.submitted => 'Đã nộp bài',
        TeamStatus.locked => 'Đã khóa',
      };

  /// Resolves an authentic, modern cover image for the team.
  String get bannerImageUrl {
    if (customBannerImageUrl != null &&
        customBannerImageUrl!.trim().isNotEmpty) {
      return customBannerImageUrl!.trim();
    }
    const List<String> pool = <String>[
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80',
    ];
    final int hash = (id.isNotEmpty ? id : name).hashCode.abs();
    return pool[hash % pool.length];
  }

  /// Resolves a modern, sleek team avatar image
  String get avatarImageUrl {
    if (customAvatarImageUrl != null &&
        customAvatarImageUrl!.trim().isNotEmpty) {
      return customAvatarImageUrl!.trim();
    }
    const List<String> avatars = <String>[
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80',
      'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=200&q=80',
      'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=200&q=80',
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=200&q=80',
    ];
    final int hash = (name.isNotEmpty ? name : id).hashCode.abs();
    return avatars[hash % avatars.length];
  }

  bool isMember(String studentId) =>
      members.any((TeamMemberModel m) => m.studentId == studentId);

  bool isLeader(String studentId) => leaderId == studentId;

  factory TeamModel.fromJson(Map<String, dynamic> json) {
    final String rawStatus =
        (json['status'] ?? 'FORMING').toString().toUpperCase();
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
      customBannerImageUrl:
          (json['bannerImageUrl'] ?? json['customBannerImageUrl']) as String?,
      customAvatarImageUrl:
          (json['avatarUrl'] ?? json['customAvatarImageUrl']) as String?,
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
        if (customBannerImageUrl != null)
          'bannerImageUrl': customBannerImageUrl,
        if (customAvatarImageUrl != null) 'avatarUrl': customAvatarImageUrl,
      };
}
