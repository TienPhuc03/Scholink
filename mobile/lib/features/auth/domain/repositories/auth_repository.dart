import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/user_entity.dart';

/// Contract for Authentication Domain operations.
abstract interface class AuthRepository {
  Future<Result<UserEntity, Failure>> login({
    required String email,
    required String password,
  });

  Future<Result<void, Failure>> register({
    required String email,
    required String password,
    required String fullName,
    String role = 'STUDENT',
  });

  Future<Result<void, Failure>> logout();

  Future<bool> isAuthenticated();

  Future<String?> getCurrentUserId();
}
