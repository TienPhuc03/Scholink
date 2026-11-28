import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/utils/text_search.dart';
import 'package:scholink_mobile/features/passport/passport_edit_view.dart';
import 'package:scholink_mobile/features/passport/passport_model.dart';
import 'package:scholink_mobile/features/passport/passport_repository.dart';
import 'package:scholink_mobile/features/passport/passport_viewmodel.dart';

import '../auth/auth_test_fakes.dart';
import 'passport_form_test.dart' show field, fieldIn;
import 'passport_test.dart' show grpcPassport;

/// A just-registered account: name from sign-up, nothing else (gRPC sends "" / 0 / []).
Map<String, dynamic> newAccountPassport({int version = 1}) => <String, dynamic>{
      ...grpcPassport(version: version),
      'education': <String, dynamic>{
        'institution': '',
        'major': '',
        'startYear': 0,
        'endYear': 0,
        'gpa': 0,
        'gpaScale': 0,
      },
      'skills': <String>[],
      'certificates': <Map<String, dynamic>>[],
    };

void main() {
  test('onboarding is needed until education with a GPA is filled in', () {
    expect(PassportModel.fromJson(newAccountPassport()).needsOnboarding, isTrue);
    // grpcPassport has education but GPA 0 (unset over gRPC).
    expect(PassportModel.fromJson(grpcPassport()).needsOnboarding, isTrue);
    final Map<String, dynamic> withGpa = grpcPassport();
    (withGpa['education'] as Map<String, dynamic>)['gpa'] = 3.4;
    expect(PassportModel.fromJson(withGpa).needsOnboarding, isFalse);
  });

  test('search ignores Vietnamese accents and case', () {
    expect(matchesSearch('Trường Đại học Bách Khoa', 'dai hoc'), isTrue);
    expect(matchesSearch('BK AI Innovators', 'innovators'), isTrue);
    expect(matchesSearch('Học bổng Nữ Công nghệ', 'nu cong nghe'), isTrue);
    expect(matchesSearch('Cuộc thi AI', 'hoc bong'), isFalse);
  });

  testWidgets(
      'onboarding requires education with GPA, lets bio and skills stay empty, then saves',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final ScriptedApiClient api = ScriptedApiClient();
    api.reply(ApiEndpoints.passport, newAccountPassport());
    final PassportViewModel vm = PassportViewModel(PassportRepository(api));
    await vm.loadPassport();
    await tester.pumpWidget(MaterialApp(
        home: PassportEditView(viewModel: vm, onboarding: true)));
    await tester.pumpAndSettle();

    // Step 1: education may not be skipped.
    expect(find.text('Hoàn thiện hồ sơ (1/3)'), findsOneWidget);
    expect(find.byKey(const Key('onboarding_skip')), findsOneWidget);
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();
    expect(find.text('Nhập tên trường.'), findsOneWidget);
    expect(find.text('Nhập GPA.'), findsOneWidget);
    expect(find.text('Hoàn thiện hồ sơ (1/3)'), findsOneWidget);

    await tester.enterText(fieldIn(const Key('passport_institution')), 'UIT');
    await tester.enterText(fieldIn(const Key('passport_major')), 'KHMT');
    await tester.enterText(field('Năm bắt đầu'), '2024');
    await tester.enterText(fieldIn(const Key('passport_gpa_4')), '3.5');
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();

    // Steps 2 and 3 are optional.
    expect(find.text('Hoàn thiện hồ sơ (2/3)'), findsOneWidget);
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();
    expect(find.text('Hoàn thiện hồ sơ (3/3)'), findsOneWidget);
    api.reply(ApiEndpoints.passport, grpcPassport(version: 2));
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();

    final RecordedCall save =
        api.calls.lastWhere((RecordedCall c) => c.method == 'PUT');
    expect(save.data['education']['institution'], 'UIT');
    expect(save.data['education']['gpa'], 3.5);
    expect(save.data['skills'], isEmpty);
  });

  testWidgets('"Bỏ qua" closes onboarding without saving',
      (WidgetTester tester) async {
    final ScriptedApiClient api = ScriptedApiClient();
    api.reply(ApiEndpoints.passport, newAccountPassport());
    final PassportViewModel vm = PassportViewModel(PassportRepository(api));
    await vm.loadPassport();
    bool? result;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (BuildContext context) => TextButton(
          onPressed: () async => result = await Navigator.of(context).push<bool>(
              MaterialPageRoute<bool>(
                  builder: (_) =>
                      PassportEditView(viewModel: vm, onboarding: true))),
          child: const Text('open'),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('onboarding_skip')));
    await tester.pumpAndSettle();
    expect(result, isFalse);
    expect(api.calls.where((RecordedCall c) => c.method == 'PUT'), isEmpty);
  });
}
