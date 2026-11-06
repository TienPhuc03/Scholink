import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/features/auth/auth_repository.dart';
import 'package:scholink_mobile/features/auth/register_view.dart';
import 'package:scholink_mobile/features/auth/register_viewmodel.dart';

import 'auth_test_fakes.dart';

void main() {
  late ScriptedApiClient api;

  Future<List<RegisterOutcome>> pumpRegister(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);

    api = ScriptedApiClient()..reply(ApiEndpoints.sendOtp, otpBody());
    final RegisterViewModel vm =
        RegisterViewModel(AuthRepository(apiClient: api, secureStorage: InMemorySecureStorage()));
    final List<RegisterOutcome> outcomes = <RegisterOutcome>[];
    await tester.pumpWidget(MaterialApp(
      home: RegisterView(viewModel: vm, onRegistered: outcomes.add, onNavigateToLogin: () {}),
    ));
    return outcomes;
  }

  testWidgets('shows the Figma texts', (WidgetTester tester) async {
    await pumpRegister(tester);
    expect(find.text('Bắt đầu cùng Scholink'), findsOneWidget);
    expect(find.text('Ít nhất 8 ký tự, gồm chữ và số.'), findsOneWidget);
    expect(find.text('Tạo tài khoản'), findsOneWidget);
    expect(find.text('Tiếp tục với Google'), findsOneWidget);
  });

  testWidgets('empty submit shows field errors and keeps the user on the form', (WidgetTester tester) async {
    final List<RegisterOutcome> outcomes = await pumpRegister(tester);
    await tester.tap(find.byKey(const Key('register_submit')));
    await tester.pump();
    expect(find.text('Vui lòng nhập họ và tên.'), findsOneWidget);
    expect(find.text('Vui lòng nhập email.'), findsOneWidget);
    expect(outcomes, isEmpty);
    expect(api.calls, isEmpty);
  });

  testWidgets('valid form registers and hands over to the OTP step', (WidgetTester tester) async {
    final List<RegisterOutcome> outcomes = await pumpRegister(tester);
    final Finder fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'Sinh Viên');
    await tester.enterText(fields.at(1), 'sv@uni.edu.vn');
    await tester.enterText(fields.at(2), 'matkhau123');
    await tester.enterText(fields.at(3), 'matkhau123');
    await tester.tap(find.byKey(const Key('register_consent')));
    await tester.tap(find.byKey(const Key('register_submit')));
    await tester.pumpAndSettle();
    expect(outcomes.single.email, 'sv@uni.edu.vn');
  });
}
