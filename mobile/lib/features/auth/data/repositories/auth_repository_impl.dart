import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../../../core/storage/secure_storage_helper.dart';
import '../../domain/entities/user_entity.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/auth_remote_data_source.dart';
import '../dtos/auth_dtos.dart';
import '../mappers/auth_mapper.dart';

class AuthRepositoryImpl implements AuthRepository {
  final AuthRemoteDataSource _remoteDataSource;
  final SecureStorageHelper _secureStorage;

  AuthRepositoryImpl({
    required AuthRemoteDataSource remoteDataSource,
    required SecureStorageHelper secureStorage,
  })  : _remoteDataSource = remoteDataSource,
        _secureStorage = secureStorage;

  @override
  Future<Result<UserEntity, Failure>> login({
    required String email,
    required String password,
  }) async {
    try {
      final LoginRequestDto request = LoginRequestDto(email: email, password: password);
      final AuthResponseDto response = await _remoteDataSource.login(request);

      final String? accessToken = response.accessToken;
      final String? refreshToken = response.refreshToken;
      final UserProfileDto? userDto = response.user;

      if (accessToken == null || refreshToken == null || userDto == null) {
        return const FailureResult<UserEntity, Failure>(
          ServerFailure(message: 'Phản hồi xác thực từ máy chủ không hợp lệ (thiếu token hoặc hồ sơ).'),
        );
      }

      final UserEntity userEntity = AuthMapper.toEntity(userDto);

      // Persist tokens securely
      await _secureStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
        userId: userEntity.id,
      );

      return SuccessResult<UserEntity, Failure>(userEntity);
    } on Failure catch (failure) {
      return FailureResult<UserEntity, Failure>(failure);
    } catch (e) {
      return FailureResult<UserEntity, Failure>(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Result<void, Failure>> register({
    required String email,
    required String password,
    required String fullName,
    String role = 'STUDENT',
  }) async {
    try {
      final RegisterRequestDto request = RegisterRequestDto(
        email: email,
        password: password,
        fullName: fullName,
        role: role,
      );
      await _remoteDataSource.register(request);
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Result<void, Failure>> logout() async {
    try {
      await _secureStorage.clear();
      return const SuccessResult<void, Failure>(null);
    } catch (e) {
      return FailureResult<void, Failure>(CacheFailure(message: e.toString()));
    }
  }

  @override
  Future<bool> isAuthenticated() async {
    final String? token = await _secureStorage.getAccessToken();
    return token != null && token.isNotEmpty;
  }

  @override
  Future<String?> getCurrentUserId() async {
    return _secureStorage.getUserId();
  }
}
