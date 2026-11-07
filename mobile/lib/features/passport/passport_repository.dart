import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'passport_model.dart';

/// Who a profile view is for (FR-PROF-05).
enum ProfileAudience {
  public('PUBLIC', 'Công khai'),
  teammates('TEAMMATES', 'Đồng đội');

  final String apiValue;
  final String label;

  const ProfileAudience(this.apiValue, this.label);
}

/// Single concrete Repository for Passport in MVVM + Repository pattern.
/// Backed by the gateway's `GET/PUT /api/v1/profiles/me` (owner taken from the token), plus the
/// field visibility settings and the profile views of FR-PROF-05.
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

  /// Saves who may see each field. The profile version does not change.
  Future<Result<PassportModel, Failure>> updateFieldPrivacy(PassportDraft draft) {
    return _guard(() async {
      final Response<dynamic> response =
          await _apiClient.put<dynamic>(ApiEndpoints.passportPrivacy, data: draft.toPrivacyJson());
      return _parse(response.data);
    });
  }

  /// The signed-in student's Passport as [audience] would see it.
  Future<Result<ProfileView, Failure>> previewMyProfile(ProfileAudience audience) {
    return _guard(() async {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.passportView,
        queryParameters: <String, dynamic>{'audience': audience.apiValue},
      );
      return _parseView(response.data);
    });
  }

  /// Public view of another student.
  Future<Result<ProfileView, Failure>> getPublicProfile(String studentId) {
    return _guard(() async {
      final Response<dynamic> response = await _apiClient.get<dynamic>(ApiEndpoints.publicProfile(studentId));
      return _parseView(response.data);
    });
  }

  /// Teammate view; the server checks that both students are in [teamId].
  Future<Result<ProfileView, Failure>> getTeammateProfile({required String teamId, required String studentId}) {
    return _guard(() async {
      final Response<dynamic> response =
          await _apiClient.get<dynamic>(ApiEndpoints.teammateProfile(teamId, studentId));
      return _parseView(response.data);
    });
  }

  PassportModel _parse(dynamic resData) {
    final dynamic payload = resData is Map<String, dynamic> ? (resData['data'] ?? resData) : resData;
    if (payload is Map<String, dynamic>) return PassportModel.fromJson(payload);
    throw const ServerFailure(message: 'Phản hồi hồ sơ từ máy chủ không hợp lệ.');
  }

  ProfileView _parseView(dynamic resData) {
    if (resData is Map<String, dynamic>) return ProfileView.fromJson(resData);
    throw const ServerFailure(message: 'Phản hồi hồ sơ từ máy chủ không hợp lệ.');
  }

  Future<Result<T, Failure>> _guard<T>(Future<T> Function() action) async {
    try {
      return SuccessResult<T, Failure>(await action());
    } on Failure catch (failure) {
      return FailureResult<T, Failure>(failure);
    } catch (e) {
      return FailureResult<T, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
