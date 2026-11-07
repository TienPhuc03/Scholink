import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/errors/result.dart';
import 'package:scholink_mobile/features/passport/passport_edit_view.dart';
import 'package:scholink_mobile/features/passport/passport_model.dart';
import 'package:scholink_mobile/features/passport/passport_repository.dart';
import 'package:scholink_mobile/features/passport/passport_validators.dart';
import 'package:scholink_mobile/features/passport/passport_viewmodel.dart';
import 'package:scholink_mobile/features/passport/profile_view_screen.dart';

import '../auth/auth_test_fakes.dart';
import 'passport_test.dart' show grpcPassport;

/// FR-PROF-05 on mobile: settings, phone, and views that only show granted fields.
Map<String, dynamic> ownerPassport({Map<String, String>? privacy, int version = 3}) => <String, dynamic>{
      ...grpcPassport(version: version),
      'email': 'a@scholink.edu.vn',
      'phone': '0901234567',
      'fieldPrivacy': privacy ?? <String, String>{'email': 'PRIVATE', 'phone': 'PRIVATE'},
    };

Map<String, dynamic> grpcView({required List<String> visible, String audience = 'PUBLIC'}) => <String, dynamic>{
      'studentId': 'u1',
      'fullName': 'Nguyễn Văn A',
      'avatarAssetId': '',
      'audience': audience,
      'visibleFields': visible,
      // gRPC sends unset values as defaults even for hidden fields.
      'email': visible.contains('email') ? 'a@scholink.edu.vn' : '',
      'phone': '',
      'bio': visible.contains('bio') ? 'Yêu AI' : '',
      'regionCode': '',
      'skills': visible.contains('skills') ? <String>['Dart'] : <String>[],
      'education': visible.contains('education')
          ? <String, dynamic>{'institution': 'ĐH Bách Khoa', 'major': 'KHMT', 'startYear': 2023, 'gpa': 3.6, 'gpaScale': 4}
          : null,
      'certificates': <dynamic>[],
      'achievements': <String>[],
      'cvAssetId': '',
      'pitchVideoAssetId': '',
    };

void main() {
  group('models', () {
    test('missing settings fall back to the server defaults (contact details private)', () {
      final PassportModel p = PassportModel.fromJson(grpcPassport());

      expect(p.visibilityOf('email'), FieldVisibility.private);
      expect(p.visibilityOf('phone'), FieldVisibility.private);
      expect(p.visibilityOf('skills'), FieldVisibility.public);
      expect(p.visibilityOf('education'), FieldVisibility.teammates);
    });

    test('the draft sends phone with the profile and visibility on its own', () {
      final PassportDraft d = PassportDraft.fromPassport(PassportModel.fromJson(ownerPassport()))
        ..phone = ' 0987 654 321 '
        ..fieldPrivacy['phone'] = FieldVisibility.teammates;

      expect(d.toUpdateJson(expectedVersion: 3)['phone'], '0987 654 321');
      expect(d.toUpdateJson(expectedVersion: 3), isNot(contains('fieldPrivacy')));
      expect((d.toPrivacyJson()['fieldPrivacy'] as Map<String, String>)['phone'], 'TEAMMATES');
      expect((d.toPrivacyJson()['fieldPrivacy'] as Map<String, String>)['email'], 'PRIVATE');
    });

    test('a view keeps only granted fields even when gRPC fills hidden ones with defaults', () {
      final ProfileView v = ProfileView.fromJson(grpcView(visible: <String>['bio', 'skills']));

      expect(v.bio, 'Yêu AI');
      expect(v.skills, <String>['Dart']);
      expect(v.email, isNull);
      expect(v.education, isNull);
      expect(v.shows('phone'), isFalse);
    });

    test('phone validation matches the server rule', () {
      expect(PassportValidators.phone(''), isNull);
      expect(PassportValidators.phone('+84 901 234 567'), isNull);
      expect(PassportValidators.phone('090-123-4567'), isNull);
      expect(PassportValidators.phone('abc'), isNotNull);
      expect(PassportValidators.phone('123'), isNotNull);
    });
  });

  group('PassportViewModel.save', () {
    test('saves changed visibility first, then the content with the same version', () async {
      final ScriptedApiClient api = ScriptedApiClient()
        ..reply(ApiEndpoints.passport, ownerPassport())
        ..reply(ApiEndpoints.passportPrivacy, ownerPassport(privacy: <String, String>{'phone': 'TEAMMATES'}));
      final PassportViewModel vm = PassportViewModel(PassportRepository(api));
      await vm.loadPassport();

      final PassportDraft d = PassportDraft.fromPassport(vm.passport!)..fieldPrivacy['phone'] = FieldVisibility.teammates;
      expect(await vm.save(d), isTrue);

      expect(api.calls.map((RecordedCall c) => '${c.method} ${c.path}').toList(), <String>[
        'GET ${ApiEndpoints.passport}',
        'PUT ${ApiEndpoints.passportPrivacy}',
        'PUT ${ApiEndpoints.passport}',
      ]);
      expect((api.callsTo(ApiEndpoints.passport).last.data as Map<String, dynamic>)['expectedVersion'], 3);
    });

    test('unchanged visibility does not call the privacy endpoint', () async {
      final ScriptedApiClient api = ScriptedApiClient()..reply(ApiEndpoints.passport, ownerPassport());
      final PassportViewModel vm = PassportViewModel(PassportRepository(api));
      await vm.loadPassport();

      expect(await vm.save(PassportDraft.fromPassport(vm.passport!)), isTrue);
      expect(api.callsTo(ApiEndpoints.passportPrivacy), isEmpty);
    });

    test('a failed visibility save keeps the draft and does not touch the content', () async {
      final ScriptedApiClient api = ScriptedApiClient()
        ..reply(ApiEndpoints.passport, ownerPassport())
        ..reply(ApiEndpoints.passportPrivacy, const ServerFailure(message: 'Mất kết nối'));
      final PassportViewModel vm = PassportViewModel(PassportRepository(api));
      await vm.loadPassport();

      final PassportDraft d = PassportDraft.fromPassport(vm.passport!)..fieldPrivacy['email'] = FieldVisibility.public;
      expect(await vm.save(d), isFalse);
      expect(vm.saveError, contains('quyền hiển thị'));
      expect(api.calls.where((RecordedCall c) => c.method == 'PUT' && c.path == ApiEndpoints.passport), isEmpty);
    });
  });

  testWidgets('the edit screen lets the student change who sees a field', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final ScriptedApiClient api = ScriptedApiClient()
      ..reply(ApiEndpoints.passport, ownerPassport())
      ..reply(ApiEndpoints.passportPrivacy, ownerPassport());
    final PassportViewModel vm = PassportViewModel(PassportRepository(api));
    await vm.loadPassport();
    await tester.pumpWidget(MaterialApp(home: PassportEditView(viewModel: vm)));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('passport_phone')), findsOneWidget);
    final Finder list = find.descendant(of: find.byType(ListView).first, matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byKey(const Key('privacy_pitchVideo')), 300, scrollable: list);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('privacy_email')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đồng đội').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();

    final Map<String, dynamic> body = api.callsTo(ApiEndpoints.passportPrivacy).single.data as Map<String, dynamic>;
    expect((body['fieldPrivacy'] as Map<String, String>)['email'], 'TEAMMATES');
  });

  testWidgets('a profile view shows granted fields, lists hidden ones and switches audience', (WidgetTester tester) async {
    final List<ProfileAudience> asked = <ProfileAudience>[];
    final ProfileViewViewModel vm = ProfileViewViewModel(
      (ProfileAudience a) async {
        asked.add(a);
        return SuccessResult<ProfileView, Failure>(ProfileView.fromJson(grpcView(
          visible: a == ProfileAudience.public ? <String>['bio', 'skills'] : <String>['bio', 'skills', 'education'],
          audience: a.apiValue,
        )));
      },
      audiences: const <ProfileAudience>[ProfileAudience.public, ProfileAudience.teammates],
    );
    await tester.pumpWidget(MaterialApp(home: ProfileViewScreen(viewModel: vm, title: 'Hồ sơ')));
    await tester.pumpAndSettle();

    expect(find.text('Yêu AI'), findsOneWidget);
    expect(find.textContaining('ĐH Bách Khoa'), findsNothing);
    expect(find.textContaining('Email'), findsOneWidget, reason: 'listed as hidden');

    await tester.tap(find.text('Đồng đội'));
    await tester.pumpAndSettle();
    expect(asked, <ProfileAudience>[ProfileAudience.public, ProfileAudience.teammates]);
    expect(find.textContaining('ĐH Bách Khoa'), findsOneWidget);
  });
}
