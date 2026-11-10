import 'dart:convert';
import 'dart:typed_data';

import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/database/local_cache_manager.dart';
import 'package:scholink_mobile/features/application/application_repository.dart';
import 'package:scholink_mobile/features/application/apply_viewmodel.dart';
import 'package:scholink_mobile/features/application/attachment_model.dart';
import 'package:scholink_mobile/features/application/media_repository.dart';
import 'package:scholink_mobile/features/application/submission_store.dart';

import '../auth/auth_test_fakes.dart';

const String oppId = 'opp_vinai_2026';

class MemoryCache implements LocalCacheManager {
  final Map<String, String> store = <String, String>{};

  @override
  Future<void> clear() async => store.clear();
  @override
  Future<dynamic> getJson(String key) async => store[key] == null ? null : jsonDecode(store[key]!);
  @override
  Future<String?> getString(String key) async => store[key];
  @override
  Future<void> remove(String key) async => store.remove(key);
  @override
  Future<void> saveJson(String key, dynamic data) async => store[key] = jsonEncode(data);
  @override
  Future<void> saveString(String key, String value) async => store[key] = value;
}

class QueuePicker implements AttachmentPicker {
  final List<PickedAttachment?> queue = <PickedAttachment?>[];

  @override
  Future<PickedAttachment?> pick() async => queue.isEmpty ? null : queue.removeAt(0);
}

PickedAttachment pdf(String name, {int size = 1200}) {
  final Uint8List bytes = Uint8List(size);
  bytes.setAll(0, ascii.encode('%PDF-1.7\n'));
  return PickedAttachment(name: name, bytes: bytes);
}

Map<String, dynamic> readinessBody({
  String screening = 'ELIGIBLE',
  List<String> missing = const <String>[],
  int profileVersion = 4,
}) =>
    <String, dynamic>{
      'opportunityId': oppId,
      'studentId': 'stu_1',
      'profileVersion': profileVersion,
      'ruleVersion': 2,
      'completionScore': 80,
      'readinessScore': missing.isEmpty ? 90 : 60,
      'isReady': missing.isEmpty && screening != 'INELIGIBLE',
      'screening': screening,
      'missingFields': missing,
      'screeningReasons': <Map<String, dynamic>>[],
    };

Map<String, dynamic> previewBody(RecordedCall call, {DateTime? expiresAt, String previewId = 'prv_1'}) {
  final Map<String, dynamic> req = call.data as Map<String, dynamic>;
  final List<dynamic> ids = (req['attachmentIds'] as List<dynamic>?) ?? <dynamic>[];
  return <String, dynamic>{
    'previewId': previewId,
    'opportunityId': req['opportunityId'],
    'submissionId': req['submissionId'],
    'snapshotId': 'snap_$previewId',
    'profileVersion': 4,
    'ruleVersion': req['expectedRuleVersion'],
    'snapshotJson': jsonEncode(<String, dynamic>{
      'studentId': 'stu_1',
      'fullName': 'Nguyễn Văn A',
      'skills': <String>['Dart'],
      'completionScore': 80,
      'profileVersion': 4,
    }),
    'manifestJson': jsonEncode(ids.map((dynamic id) => <String, dynamic>{'assetId': id}).toList()),
    'manifestHash': 'm' * 64,
    'payloadHash': 'p' * 64,
    'screening': 'ELIGIBLE',
    'expiresAt': (expiresAt ?? DateTime.now().add(const Duration(minutes: 10))).toUtc().toIso8601String(),
    'screeningReasons': <Map<String, dynamic>>[],
  };
}

Map<String, dynamic> submitOk() => <String, dynamic>{
      'applicationId': 'app_1',
      'revision': 1,
      'status': 'SUBMITTED',
      'screening': 'ELIGIBLE',
    };

/// Wires a ScriptedApiClient with a working happy path; tests override what they need.
class ApplyHarness {
  final ScriptedApiClient api = ScriptedApiClient();
  final MemoryCache cache = MemoryCache();
  final QueuePicker picker = QueuePicker();
  DateTime now = DateTime(2026, 11, 7, 9);
  int _ids = 0;

  ApplyHarness() {
    api.reply(ApiEndpoints.myApplications, <dynamic>[]);
    api.reply(ApiEndpoints.readiness, readinessBody());
    api.handlers[ApiEndpoints.applicationPreviews] =
        (RecordedCall c) => previewBody(c, expiresAt: now.add(const Duration(minutes: 10)));
    api.reply(ApiEndpoints.consents, <String, dynamic>{'consentId': 'cns_1', 'previewId': 'prv_1'});
    api.reply(ApiEndpoints.applications, submitOk());
    api.reply(ApiEndpoints.mediaUploadUrl, <String, dynamic>{'assetId': 'ast_1', 'status': 'UPLOADING'});
    api.reply(ApiEndpoints.mediaComplete('ast_1'), <String, dynamic>{'id': 'ast_1', 'status': 'READY'});
  }

  ApplyViewModel build() => ApplyViewModel(
        applications: ApplicationRepository(api),
        media: MediaRepository(api),
        store: SubmissionStore(cache, clock: () => now),
        picker: picker,
        opportunityId: oppId,
        opportunityTitle: 'Học bổng VinAI 2026',
        clock: () => now,
        newId: () => 'id_${++_ids}',
      );

  List<RecordedCall> get submits => api.callsTo(ApiEndpoints.applications);
}
