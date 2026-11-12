import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/application/attachment_model.dart';
import 'package:scholink_mobile/features/application/media_repository.dart';
import 'package:scholink_mobile/features/auth/auth_repository.dart';
import 'package:scholink_mobile/features/passport/passport_repository.dart';
import 'package:scholink_mobile/features/passport/passport_viewmodel.dart';

import '../auth/auth_test_fakes.dart';
import 'passport_test.dart' show grpcPassport;

final Uint8List pdf = Uint8List.fromList(<int>[0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
final Uint8List png = Uint8List.fromList(<int>[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

void main() {
  group('Passport documents (FR-PROF-04)', () {
    late ScriptedApiClient api;
    late List<String> puts;

    PassportViewModel build(PickedAttachment? file) => PassportViewModel(
          PassportRepository(api),
          media: MediaRepository(api, put: (String url, List<int> bytes, String mime) async => puts.add('$url|$mime')),
          pick: (List<String> extensions) async => file,
        );

    setUp(() {
      puts = <String>[];
      api = ScriptedApiClient()
        ..reply(ApiEndpoints.passport, grpcPassport())
        ..reply(ApiEndpoints.mediaUploadUrl, <String, dynamic>{
          'assetId': 'ast_cv',
          'uploadUrl': 'http://10.0.2.2:9000/scholink-documents/uploads/u1/cv/ast_cv-cv.pdf?X-Amz-Signature=x',
        })
        ..reply(ApiEndpoints.mediaComplete('ast_cv'), <String, dynamic>{'id': 'ast_cv', 'status': 'READY'});
    });

    test('uploads the bytes to the bucket, then links the asset with the current version', () async {
      final PassportViewModel vm = build(PickedAttachment(name: 'cv.pdf', bytes: pdf));
      await vm.loadPassport();

      expect(await vm.uploadDocument(PassportDocument.cv), isTrue);
      expect(puts.single, endsWith('|application/pdf'));
      expect(api.callsTo(ApiEndpoints.mediaUploadUrl).single.data['category'], 'CV');
      final RecordedCall save = api.calls.where((RecordedCall c) => c.method == 'PUT').single;
      expect(save.data['cvAssetId'], 'ast_cv');
      expect(save.data['expectedVersion'], 3);
      expect(save.data['fullName'], 'Nguyễn Văn A');
    });

    test('a placeholder upload URL (no object storage) sends no bytes', () async {
      api.reply(ApiEndpoints.mediaUploadUrl, <String, dynamic>{
        'assetId': 'ast_cv',
        'uploadUrl': 'https://storage.scholink.edu.vn/uploads/u1/cv/ast_cv?token=t',
      });
      final PassportViewModel vm = build(PickedAttachment(name: 'cv.pdf', bytes: pdf));
      await vm.loadPassport();

      expect(await vm.uploadDocument(PassportDocument.cv), isTrue);
      expect(puts, isEmpty);
    });

    test('rejects a file of the wrong type before any request', () async {
      final PassportViewModel vm = build(PickedAttachment(name: 'cv.pdf', bytes: png));
      await vm.loadPassport();

      expect(await vm.uploadDocument(PassportDocument.cv), isFalse);
      expect(vm.documentError, contains('không khớp'));
      expect(api.callsTo(ApiEndpoints.mediaUploadUrl), isEmpty);
    });

    test('accepts a PNG avatar with the avatar category and MIME type', () async {
      final PassportViewModel vm = build(PickedAttachment(name: 'me.png', bytes: png));
      await vm.loadPassport();

      expect(await vm.uploadDocument(PassportDocument.avatar), isTrue);
      expect(api.callsTo(ApiEndpoints.mediaUploadUrl).single.data['category'], 'AVATAR');
      expect(api.callsTo(ApiEndpoints.mediaUploadUrl).single.data['mimeType'], 'image/png');
      expect(api.calls.where((RecordedCall c) => c.method == 'PUT').single.data['avatarAssetId'], 'ast_cv');
    });

    test('a cancelled picker changes nothing', () async {
      final PassportViewModel vm = build(null);
      await vm.loadPassport();

      expect(await vm.uploadDocument(PassportDocument.cv), isFalse);
      expect(vm.documentError, isNull);
      expect(api.callsTo(ApiEndpoints.mediaUploadUrl), isEmpty);
    });
  });

  group('Account deletion (F40)', () {
    test('sends the password and snapshot decision, then clears local tokens', () async {
      final ScriptedApiClient api = ScriptedApiClient()
        ..reply(ApiEndpoints.deleteAccount, <String, dynamic>{'trackingId': 'del_1'});
      final InMemorySecureStorage storage = InMemorySecureStorage();
      await storage.saveTokens(accessToken: 'a', refreshToken: 'r');
      final AuthRepository repo = AuthRepository(apiClient: api, secureStorage: storage);

      final Failure? failure = (await repo.deleteAccount(currentPassword: 'pw', purgeSnapshots: true)).errorOrNull;

      expect(failure, isNull);
      expect(api.callsTo(ApiEndpoints.deleteAccount).single.data,
          <String, dynamic>{'currentPassword': 'pw', 'snapshotDecision': 'PURGE'});
      expect(await storage.getAccessToken(), isNull);
    });

    test('a wrong password keeps the session', () async {
      final ScriptedApiClient api = ScriptedApiClient()
        ..reply(ApiEndpoints.deleteAccount,
            const ServerFailure(message: 'Mật khẩu xác thực lại không chính xác', code: 'UNAUTHENTICATED'));
      final InMemorySecureStorage storage = InMemorySecureStorage();
      await storage.saveTokens(accessToken: 'a', refreshToken: 'r');
      final AuthRepository repo = AuthRepository(apiClient: api, secureStorage: storage);

      final Failure? failure = (await repo.deleteAccount(currentPassword: 'bad')).errorOrNull;

      expect(failure?.message, contains('Mật khẩu'));
      expect(await storage.getAccessToken(), 'a');
    });
  });
}
