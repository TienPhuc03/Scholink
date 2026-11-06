import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'application_model.dart';

/// Consent returned by `POST /api/v1/profiles/me/consents`.
class ConsentReceipt {
  final String consentId;
  final String previewId;

  const ConsentReceipt({required this.consentId, required this.previewId});
}

/// Individual application flow (F19) against the gateway:
/// readiness → preview → consent → submit, plus "Hồ sơ của tôi".
class ApplicationRepository {
  final ApiClient _api;

  ApplicationRepository(this._api);

  Future<Result<ReadinessResult, Failure>> checkReadiness(String opportunityId) => _guard(() async {
        final Response<dynamic> r = await _api.get<dynamic>(
          ApiEndpoints.readiness,
          queryParameters: <String, dynamic>{'opportunityId': opportunityId},
        );
        return ReadinessResult.fromJson(unwrapData(r.data));
      });

  Future<Result<ApplicationPreview, Failure>> createPreview({
    required String opportunityId,
    required String submissionId,
    required int expectedRuleVersion,
    required List<String> attachmentIds,
  }) =>
      _guard(() async {
        final Response<dynamic> r = await _api.post<dynamic>(
          ApiEndpoints.applicationPreviews,
          data: <String, dynamic>{
            'opportunityId': opportunityId,
            'submissionId': submissionId,
            'expectedRuleVersion': expectedRuleVersion,
            'attachmentIds': attachmentIds,
          },
        );
        return ApplicationPreview.fromJson(unwrapData(r.data));
      });

  /// Q12: SNAPSHOT always, ATTACHMENTS only when files are attached.
  Future<Result<ConsentReceipt, Failure>> createConsent(ApplicationPreview preview) => _guard(() async {
        final Response<dynamic> r = await _api.post<dynamic>(
          ApiEndpoints.consents,
          data: <String, dynamic>{
            'previewId': preview.previewId,
            'snapshotId': preview.snapshotId,
            'opportunityId': preview.opportunityId,
            'submissionId': preview.submissionId,
            'profileVersion': preview.profileVersion,
            'ruleVersion': preview.ruleVersion,
            'payloadHash': preview.payloadHash,
            'manifestHash': preview.manifestHash,
            'scope': <String>['SNAPSHOT', if (preview.attachmentIds.isNotEmpty) 'ATTACHMENTS'],
          },
        );
        final Map<String, dynamic> m = unwrapData(r.data);
        final String consentId = (m['consentId'] ?? m['id'] ?? '').toString();
        if (consentId.isEmpty) {
          throw const ServerFailure(message: 'Máy chủ không trả về mã xác nhận đồng ý.');
        }
        return ConsentReceipt(consentId: consentId, previewId: preview.previewId);
      });

  /// Builds the exact body for `POST /api/v1/applications`. It is persisted together with the
  /// Idempotency-Key, because the backend rejects the same key with a different body.
  static Map<String, dynamic> buildSubmitBody(ApplicationPreview preview, ConsentReceipt consent) =>
      <String, dynamic>{
        'opportunityId': preview.opportunityId,
        'submissionId': preview.submissionId,
        'submissionType': 'INDIVIDUAL',
        'expectedRuleVersion': preview.ruleVersion,
        'previewId': preview.previewId,
        'snapshotId': preview.snapshotId,
        'profileVersion': preview.profileVersion,
        'payloadHash': preview.payloadHash,
        'consentId': consent.consentId,
      };

  Future<Result<SubmitResult, Failure>> submit({
    required Map<String, dynamic> body,
    required String idempotencyKey,
  }) =>
      _guard(() async {
        final Response<dynamic> r = await _api.post<dynamic>(
          ApiEndpoints.applications,
          data: body,
          options: Options(headers: <String, dynamic>{'Idempotency-Key': idempotencyKey}),
        );
        return SubmitResult.fromJson(unwrapData(r.data));
      });

  Future<Result<List<ApplicationSummary>, Failure>> getMyApplications() => _guard(() async {
        final Response<dynamic> r = await _api.get<dynamic>(ApiEndpoints.myApplications);
        final dynamic data = r.data is Map<String, dynamic> ? ((r.data as Map<String, dynamic>)['data'] ?? (r.data as Map<String, dynamic>)['items']) : r.data;
        final List<ApplicationSummary> items = data is List
            ? data.whereType<Map<String, dynamic>>().map(ApplicationSummary.fromJson).toList()
            : <ApplicationSummary>[];
        items.sort((ApplicationSummary a, ApplicationSummary b) =>
            (b.submittedAt ?? DateTime(0)).compareTo(a.submittedAt ?? DateTime(0)));
        return items;
      });

  Future<Result<ApplicationDetail, Failure>> getApplication(String id) => _guard(() async {
        final Response<dynamic> r = await _api.get<dynamic>(ApiEndpoints.applicationDetail(id));
        return ApplicationDetail.fromJson(unwrapData(r.data));
      });

  Future<Result<T, Failure>> _guard<T>(Future<T> Function() action) async {
    try {
      return SuccessResult<T, Failure>(await action());
    } on Failure catch (f) {
      return FailureResult<T, Failure>(f);
    } catch (e) {
      return FailureResult<T, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
