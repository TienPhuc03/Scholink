import '../../../../core/errors/failures.dart';
import '../../domain/entities/team_entity.dart';
import '../dtos/team_dtos.dart';

abstract final class TeamMapper {
  static TeamEntity toEntity(TeamDetailDto dto) {
    final String id = dto.id ?? '';
    final String competitionId = dto.competitionId ?? '';
    final String name = dto.name ?? 'Đội thi Scholink';
    final String leaderId = dto.leaderId ?? '';

    if (id.isEmpty) {
      throw const ValidationFailure(message: 'Dữ liệu đội thi thiếu id.');
    }

    final String rawStatus = (dto.status ?? 'FORMING').toUpperCase();
    final TeamStatus status = switch (rawStatus) {
      'ACTIVE' => TeamStatus.active,
      'SUBMITTING' => TeamStatus.submitting,
      'SUBMITTED' => TeamStatus.submitted,
      'LOCKED' => TeamStatus.locked,
      _ => TeamStatus.forming,
    };

    final List<TeamMemberEntity> members = (dto.members ?? <TeamMemberDto>[])
        .map(_toMemberEntity)
        .toList();

    return TeamEntity(
      id: id,
      competitionId: competitionId,
      name: name,
      description: dto.description,
      leaderId: leaderId,
      minSize: dto.minSize ?? 2,
      maxSize: dto.maxSize ?? 5,
      status: status,
      members: members,
    );
  }

  static TeamMemberEntity _toMemberEntity(TeamMemberDto dto) {
    DateTime joined = DateTime.now();
    if (dto.joinedAt != null && dto.joinedAt!.isNotEmpty) {
      joined = DateTime.tryParse(dto.joinedAt!) ?? DateTime.now();
    }

    return TeamMemberEntity(
      studentId: dto.studentId ?? '',
      role: dto.role ?? 'MEMBER',
      joinedAt: joined,
    );
  }
}
