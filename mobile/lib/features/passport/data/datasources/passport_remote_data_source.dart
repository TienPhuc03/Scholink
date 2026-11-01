import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../dtos/passport_dtos.dart';

abstract interface class PassportRemoteDataSource {
  Future<PassportDetailDto> getMyPassport();
}

class PassportRemoteDataSourceImpl implements PassportRemoteDataSource {
  final ApiClient _apiClient;

  PassportRemoteDataSourceImpl(this._apiClient);

  @override
  Future<PassportDetailDto> getMyPassport() async {
    final Response<dynamic> response = await _apiClient.get<dynamic>(
      ApiEndpoints.passport,
    );

    final dynamic resData = response.data;
    if (resData is Map<String, dynamic>) {
      return PassportDetailDto.fromJson(resData);
    }
    return const PassportDetailDto();
  }
}
