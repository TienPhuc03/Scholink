import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../dtos/opportunity_dtos.dart';

abstract interface class OpportunityRemoteDataSource {
  Future<OpportunityListResponseDto> getOpportunities({
    String? type,
    String? cursor,
    int limit = 20,
  });

  Future<OpportunityItemDto> getOpportunityById(String id);
}

class OpportunityRemoteDataSourceImpl implements OpportunityRemoteDataSource {
  final ApiClient _apiClient;

  OpportunityRemoteDataSourceImpl(this._apiClient);

  @override
  Future<OpportunityListResponseDto> getOpportunities({
    String? type,
    String? cursor,
    int limit = 20,
  }) async {
    final Map<String, dynamic> query = <String, dynamic>{
      'limit': limit,
    };
    if (type != null && type.isNotEmpty && type != 'ALL') {
      query['type'] = type;
    }
    if (cursor != null) {
      query['cursor'] = cursor;
    }

    final Response<dynamic> response = await _apiClient.get<dynamic>(
      ApiEndpoints.opportunities,
      queryParameters: query,
    );

    return OpportunityListResponseDto.fromJson(response.data);
  }

  @override
  Future<OpportunityItemDto> getOpportunityById(String id) async {
    final Response<dynamic> response = await _apiClient.get<dynamic>(
      ApiEndpoints.opportunityDetail(id),
    );

    final dynamic resData = response.data;
    if (resData is Map<String, dynamic>) {
      final dynamic payload = resData['data'] ?? resData;
      if (payload is Map<String, dynamic>) {
        return OpportunityItemDto.fromJson(payload);
      }
    }
    return const OpportunityItemDto();
  }
}
