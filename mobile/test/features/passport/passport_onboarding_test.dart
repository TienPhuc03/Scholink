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
  test('only an incomplete Passport needs onboarding', () {
    expect(PassportModel.fromJson(newAccountPassport()).needsOnboarding, isTrue);
    expect(PassportModel.fromJson(grpcPassport()).needsOnboarding, isFalse);
  });

  test('search ignores Vietnamese accents and case', () {
    expect(matchesSearch('Trường Đại học Bách Khoa', 'dai hoc'), isTrue);
    expect(matchesSearch('BK AI Innovators', 'innovators'), isTrue);
    expect(matchesSearch('Học bổng Nữ Công nghệ', 'nu cong nghe'), isTrue);
    expect(matchesSearch('Cuộc thi AI', 'hoc bong'), isFalse);
  });

  testWidgets(
      'onboarding requires education and a skill, one step at a time, then saves',
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

    expect(find.text('Hoàn thiện hồ sơ (1/3)'), findsOneWidget);
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();

    // Step 2: education may not be skipped.
    expect(find.text('Hoàn thiện hồ sơ (2/3)'), findsOneWidget);
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();
    expect(find.text('Nhập tên trường.'), findsOneWidget);
    expect(find.text('Hoàn thiện hồ sơ (2/3)'), findsOneWidget);

    await tester.enterText(fieldIn(const Key('passport_institution')), 'UIT');
    await tester.enterText(fieldIn(const Key('passport_major')), 'KHMT');
    await tester.enterText(field('Năm bắt đầu'), '2024');
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();

    // Step 3: at least one skill.
    expect(find.text('Hoàn thiện hồ sơ (3/3)'), findsOneWidget);
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();
    expect(find.text('Thêm ít nhất 1 kỹ năng.'), findsOneWidget);
    expect(api.calls.where((RecordedCall c) => c.method == 'PUT'), isEmpty);

    await tester.enterText(
        find.widgetWithText(TextField, 'VD: Python, Thuyết trình'), 'Python');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    api.reply(ApiEndpoints.passport, grpcPassport(version: 2));
    await tester.tap(find.byKey(const Key('passport_save')));
    await tester.pumpAndSettle();

    final RecordedCall save =
        api.calls.lastWhere((RecordedCall c) => c.method == 'PUT');
    expect(save.data['education']['institution'], 'UIT');
    expect(save.data['skills'], <String>['Python']);
  });
}
