import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'passport_model.dart';

/// Single concrete Repository for Passport in MVVM + Repository pattern.
class PassportRepository {
  final ApiClient _apiClient;

  PassportRepository(this._apiClient);

  Future<Result<PassportModel, Failure>> getMyPassport() async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.passport,
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        return SuccessResult<PassportModel, Failure>(PassportModel.fromJson(payload));
      }

      return const FailureResult<PassportModel, Failure>(
        ServerFailure(message: 'Phản hồi hồ sơ từ máy chủ không hợp lệ.'),
      );
    } on Failure catch (failure) {
      return FailureResult<PassportModel, Failure>(failure);
    } catch (e) {
      return FailureResult<PassportModel, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
