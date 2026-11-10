import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import '../team/team_model.dart';
import 'application_model.dart';
import 'application_repository.dart';
import 'team_submission_model.dart';

/// Team submission (APP-05, WF07) against the gateway (F37). The roster freeze and member
/// consents live in Collaboration; preview, Identity consent and the TEAM commit reuse the
/// individual flow endpoints through [ApplicationRepository].
class TeamSubmissionRepository {
  final ApiClient _api;
  final ApplicationRepository applications;

  TeamSubmissionRepository(this._api, this.applications);

  Future<Result<TeamModel, Failure>> getTeam(String teamId) => _guard(() async {
        final Response<dynamic> r = await _api.get<dynamic>(ApiEndpoints.teamDetail(teamId));
        return TeamModel.fromJson(unwrapData(r.data));
      });

  /// Teams of a competition; used to find the signed-in student's own team.
  Future<Result<List<TeamModel>, Failure>> getCompetitionTeams(String competitionId) => _guard(() async {
        final Response<dynamic> r = await _api.get<dynamic>(ApiEndpoints.competitionTeams(competitionId));
        final dynamic data = r.data is Map<String, dynamic> ? (r.data as Map<String, dynamic>)['data'] : r.data;
        return data is List
            ? data.whereType<Map<String, dynamic>>().map(TeamModel.fromJson).toList()
            : <TeamModel>[];
      });

  Future<Result<TeamSubmissionStatus, Failure>> getStatus(String teamId) => _guard(() async {
        final Response<dynamic> r = await _api.get<dynamic>(ApiEndpoints.teamSubmission(teamId));
        return TeamSubmissionStatus.fromJson(unwrapData(r.data));
      });

  /// Leader only: freezes the roster for 10 minutes and opens the consent round.
  Future<Result<void, Failure>> prepare(String teamId) => _guard(() async {
        await _api.post<dynamic>(ApiEndpoints.prepareTeamSubmission(teamId));
      });

  /// Leader only: releases the roster freeze. Aborting an already aborted session is a no-op.
  Future<Result<void, Failure>> abort(String reservationId) => _guard(() async {
        await _api.post<dynamic>(ApiEndpoints.abortTeamSubmission(reservationId));
      });

  /// Leader only: lets a withdrawn team prepare a new submission (resubmit, Q18).
  Future<Result<void, Failure>> reopen(String teamId) => _guard(() async {
        await _api.post<dynamic>(ApiEndpoints.reopenTeam(teamId));
      });

  /// Records the member's consent with the preview and Identity consent they just made.
  Future<Result<void, Failure>> giveConsent({
    required String reservationId,
    required int rosterVersion,
    required ApplicationPreview preview,
    required ConsentReceipt consent,
  }) =>
      _guard(() async {
        await _api.post<dynamic>(
          ApiEndpoints.teamSubmissionConsents(reservationId),
          data: <String, dynamic>{
            'snapshotId': preview.snapshotId,
            'payloadHash': preview.payloadHash,
            'profileVersion': preview.profileVersion,
            'rosterVersion': rosterVersion,
            'previewId': preview.previewId,
            'identityConsentId': consent.consentId,
          },
        );
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
