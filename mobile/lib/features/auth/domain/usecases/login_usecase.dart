import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/user_entity.dart';
import '../repositories/auth_repository.dart';

/// Single Responsibility Use Case: Authenticate user with email and password.
class LoginUseCase {
  final AuthRepository _repository;

  LoginUseCase(this._repository);

  Future<Result<UserEntity, Failure>> call({
    required String email,
    required String password,
  }) async {
    final String trimmedEmail = email.trim();
    if (trimmedEmail.isEmpty) {
      return const FailureResult<UserEntity, Failure>(
        ValidationFailure(message: 'Email không được để trống.'),
      );
    }
    if (password.isEmpty) {
      return const FailureResult<UserEntity, Failure>(
        ValidationFailure(message: 'Mật khẩu không được để trống.'),
      );
    }

    return _repository.login(
      email: trimmedEmail,
      password: password,
    );
  }
}
