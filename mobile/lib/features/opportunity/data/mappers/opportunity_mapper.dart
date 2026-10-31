import '../../../../core/errors/failures.dart';
import '../../domain/entities/opportunity_entity.dart';
import '../dtos/opportunity_dtos.dart';

abstract final class OpportunityMapper {
  static OpportunityEntity toEntity(OpportunityItemDto dto) {
    final String id = dto.id ?? '';
    final String title = dto.title ?? 'Cơ hội Scholink';
    final String description = dto.description ?? 'Thông tin chi tiết đang cập nhật';
    final String organizerName = dto.organizerName ?? 'Ban Tổ Chức';
    final String applyMode = dto.applyMode ?? 'IN_APP';
    final String registerDeadline = dto.registerDeadline ?? 'Đang mở đăng ký';

    if (id.isEmpty) {
      throw const ValidationFailure(message: 'Cơ hội thiếu mã định danh id hợp lệ.');
    }

    final String rawType = (dto.type ?? 'SCHOLARSHIP').toUpperCase();
    final OpportunityType type = rawType.contains('COMP')
        ? OpportunityType.competition
        : OpportunityType.scholarship;

    return OpportunityEntity(
      id: id,
      type: type,
      title: title,
      description: description,
      organizerName: organizerName,
      applyMode: applyMode,
      registerDeadline: registerDeadline,
      submitDeadline: dto.submitDeadline,
      fundingLevel: dto.fundingLevel,
      competitionMode: dto.competitionMode,
      tags: dto.tags ?? const <String>[],
    );
  }
}
