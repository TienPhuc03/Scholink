import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'passport_model.dart';

/// Single concrete Repository for Passport in MVVM + Repository pattern.
/// Backed by the gateway's `GET/PUT /api/v1/profiles/me` (owner taken from the token).
class PassportRepository {
  final ApiClient _apiClient;

  PassportRepository(this._apiClient);

  Future<Result<PassportModel, Failure>> getMyPassport() {
    return _guard(() async {
      final Response<dynamic> response = await _apiClient.get<dynamic>(ApiEndpoints.passport);
      return _parse(response.data);
    });
  }

  Future<Result<PassportModel, Failure>> updateMyPassport(
    PassportDraft draft, {
    required int expectedVersion,
  }) {
    return _guard(() async {
      final Response<dynamic> response = await _apiClient.put<dynamic>(
        ApiEndpoints.passport,
        data: draft.toUpdateJson(expectedVersion: expectedVersion),
      );
      return _parse(response.data);
    });
  }

  PassportModel _parse(dynamic resData) {
    final dynamic payload = resData is Map<String, dynamic> ? (resData['data'] ?? resData) : resData;
    if (payload is Map<String, dynamic>) return PassportModel.fromJson(payload);
    throw const ServerFailure(message: 'Phản hồi hồ sơ từ máy chủ không hợp lệ.');
  }

  Future<Result<PassportModel, Failure>> _guard(Future<PassportModel> Function() action) async {
    try {
      return SuccessResult<PassportModel, Failure>(await action());
    } on Failure catch (failure) {
      return FailureResult<PassportModel, Failure>(failure);
    } catch (e) {
      return FailureResult<PassportModel, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
