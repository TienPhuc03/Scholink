import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../dtos/auth_dtos.dart';

abstract interface class AuthRemoteDataSource {
  Future<AuthResponseDto> login(LoginRequestDto request);
  Future<void> register(RegisterRequestDto request);
}

class AuthRemoteDataSourceImpl implements AuthRemoteDataSource {
  final ApiClient _apiClient;

  AuthRemoteDataSourceImpl(this._apiClient);

  @override
  Future<AuthResponseDto> login(LoginRequestDto request) async {
    final Response<dynamic> response = await _apiClient.post<dynamic>(
      ApiEndpoints.login,
      data: request.toJson(),
    );

    final dynamic resData = response.data;
    if (resData is Map<String, dynamic>) {
      return AuthResponseDto.fromJson(resData);
    }
    return const AuthResponseDto();
  }

  @override
  Future<void> register(RegisterRequestDto request) async {
    await _apiClient.post<dynamic>(
      ApiEndpoints.register,
      data: request.toJson(),
    );
  }
}
