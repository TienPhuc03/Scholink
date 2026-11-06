import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/passport/passport_model.dart';
import 'package:scholink_mobile/features/passport/passport_repository.dart';
import 'package:scholink_mobile/features/passport/passport_validators.dart';
import 'package:scholink_mobile/features/passport/passport_viewmodel.dart';

import '../auth/auth_test_fakes.dart';

/// Shape of PassportResponse as the gateway forwards it from gRPC (unset scalars = defaults).
Map<String, dynamic> grpcPassport({int version = 3}) => <String, dynamic>{
      'id': 'p1',
      'studentId': 'u1',
      'profileVersion': version,
      'fullName': 'Nguyễn Văn A',
      'bio': '',
      'avatarAssetId': '',
      'regionCode': 'VN-SG',
      'education': <String, dynamic>{
        'institution': 'ĐH Bách Khoa',
        'major': 'KHMT',
        'startYear': 2023,
        'endYear': 0,
        'gpa': 0,
        'gpaScale': 4,
      },
      'skills': <String>['Dart', 'NestJS'],
      'achievements': <String>[],
      'cvAssetId': '',
      'isLookingForTeammate': true,
      'isOpenForScholarship': false,
      'isOpenForMentoring': false,
      'completionScore': 55,
      'certificates': <Map<String, dynamic>>[
        <String, dynamic>{
          'type': 'IELTS',
          'name': 'IELTS Academic',
          'score': '7.5',
          'issuedDate': '2025-06-01T00:00:00.000Z',
          'expiryDate': '',
          'assetId': '',
          'status': 'SELF_DECLARED',
        },
      ],
    };

void main() {
  group('PassportModel', () {
    test('maps gRPC default values back to null', () {
      final PassportModel p = PassportModel.fromJson(grpcPassport());
      expect(p.bio, isNull);
      expect(p.avatarAssetId, isNull);
      expect(p.education!.endYear, isNull);
      expect(p.education!.gpa, isNull);
      expect(p.education!.gpaDisplay, 'Chưa cập nhật GPA');
      expect(p.certificates.single.expiryDate, isNull);
      expect(p.certificates.single.isVerified, isFalse);
      expect(p.profileVersion, 3);
    });

    test('update body carries expectedVersion and omits empty optional fields', () {
      final PassportDraft draft = PassportDraft.fromPassport(PassportModel.fromJson(grpcPassport()));
      final Map<String, dynamic> body = draft.toUpdateJson(expectedVersion: 3);
      expect(body['expectedVersion'], 3);
      expect((body['education'] as Map<String, dynamic>).containsKey('gpa'), isFalse);
      expect((body['education'] as Map<String, dynamic>).containsKey('endYear'), isFalse);
      expect(body.containsKey('avatarAssetId'), isFalse);
      expect((body['certificates'] as List<dynamic>).single['issuedDate'], '2025-06-01T00:00:00.000Z');
    });
  });

  group('PassportValidators', () {
    test('education is optional but must be complete once started', () {
      final ({String? institution, String? major, String? startYear, String? endYear, String? gpa}) empty =
          PassportValidators.education(
              institution: '', major: '', startYear: '', endYear: '', gpa: '', gpaScale: 4);
      expect(<String?>[empty.institution, empty.major, empty.startYear], everyElement(isNull));

      final ({String? institution, String? major, String? startYear, String? endYear, String? gpa}) partial =
          PassportValidators.education(
              institution: 'ĐH A', major: '', startYear: '2023', endYear: '2021', gpa: '4.5', gpaScale: 4);
      expect(partial.major, isNotNull);
      expect(partial.endYear, isNotNull);
      expect(partial.gpa, isNotNull);
    });

    test('certificate issued date cannot be in the future', () {
      final DateTime now = DateTime(2026, 11, 6);
      expect(PassportValidators.certificateDates(DateTime(2027), null, now: now), isNotNull);
      expect(PassportValidators.certificateDates(DateTime(2025), DateTime(2024), now: now), isNotNull);
      expect(PassportValidators.certificateDates(DateTime(2025), null, now: now), isNull);
    });
  });

  group('PassportViewModel', () {
    test('loads from GET /api/v1/profiles/me', () async {
      final ScriptedApiClient api = ScriptedApiClient()..reply(ApiEndpoints.passport, grpcPassport());
      final PassportViewModel vm = PassportViewModel(PassportRepository(api));
      await vm.loadPassport();
      expect(api.calls.single.path, '/api/v1/profiles/me');
      expect(vm.passport?.fullName, 'Nguyễn Văn A');
    });

    test('VERSION_MISMATCH reloads the passport and reports a conflict', () async {
      final ScriptedApiClient api = ScriptedApiClient()..reply(ApiEndpoints.passport, grpcPassport());
      final PassportViewModel vm = PassportViewModel(PassportRepository(api));
      await vm.loadPassport();

      // The PUT shares the path with GET in this fake, so script a failure, then restore for the reload.
      final PassportDraft draft = PassportDraft.fromPassport(vm.passport!);
      api.reply(ApiEndpoints.passport, const ServerFailure(message: 'conflict', code: 'VERSION_MISMATCH'));
      final Future<bool> saving = vm.save(draft);
      api.reply(ApiEndpoints.passport, grpcPassport(version: 4));
      expect(await saving, isFalse);
      expect(vm.hadVersionConflict, isTrue);
      expect(vm.saveError, isNotNull);
      expect(api.calls.where((RecordedCall c) => c.method == 'PUT').single.data['expectedVersion'], 3);
    });
  });
}
