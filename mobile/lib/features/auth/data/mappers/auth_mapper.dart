import '../../../../core/errors/failures.dart';
import '../../domain/entities/user_entity.dart';
import '../dtos/auth_dtos.dart';

/// Tier 2: Defensive Mapper transforming nullable DTO into strictly non-nullable Domain Entity.
abstract final class AuthMapper {
  static UserEntity toEntity(UserProfileDto dto) {
    final String id = dto.id ?? '';
    final String email = dto.email ?? '';
    final String fullName = dto.fullName ?? 'Sinh viên Scholink';
    final String role = dto.role ?? 'STUDENT';

    if (id.isEmpty) {
      throw const ValidationFailure(message: 'Dữ liệu người dùng từ máy chủ thiếu trường id.');
    }

    return UserEntity(
      id: id,
      email: email,
      fullName: fullName,
      role: role,
    );
  }
}
