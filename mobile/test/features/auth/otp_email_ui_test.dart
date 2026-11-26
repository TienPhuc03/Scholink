import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/features/auth/auth_model.dart';
import 'package:scholink_mobile/features/auth/auth_repository.dart';
import 'package:scholink_mobile/features/auth/email_verification_view.dart';
import 'package:scholink_mobile/features/auth/email_verification_viewmodel.dart';
import 'package:scholink_mobile/features/auth/forgot_password_view.dart';
import 'package:scholink_mobile/features/auth/password_reset_viewmodel.dart';
import 'package:scholink_mobile/features/auth/reset_password_view.dart';

import 'auth_test_fakes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Map<String, dynamic> smtpOtpBody({String email = 'sv@uni.edu.vn'}) =>
      <String, dynamic>{
        'sent': true,
        'email': email,
        'purpose': 'VERIFY_EMAIL',
        'expiresInSeconds': 300,
        'cooldownSeconds': 60,
        'message': 'Mã OTP đã được phát hành và gửi tới email của bạn',
        'devOtpPreview': '',
        'deliveryChannel': 'SMTP',
      };

  test('OtpTicket detects SMTP delivery channel without dev preview', () {
    final OtpTicket ticket =
        OtpTicket.fromJson(smtpOtpBody(), fallbackEmail: 'sv@uni.edu.vn');
    expect(ticket.isEmailDelivered, isTrue);
    expect(ticket.devOtpPreview, isNull);
    expect(ticket.expiresInSeconds, 300);
  });

  testWidgets(
      'EmailVerificationView shows SMTP delivery status, live timer, and clipboard paste',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);

    String clipboardText = 'Ma xac thuc Scholink cua ban la 654321.';
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform,
            (MethodCall call) async {
      if (call.method == 'Clipboard.getData') {
        return <String, dynamic>{'text': clipboardText};
      }
      return null;
    });
    addTearDown(() => TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));

    final ScriptedApiClient api = ScriptedApiClient()
      ..reply(ApiEndpoints.login, loginBody());
    final InMemorySecureStorage storage = InMemorySecureStorage();
    final AuthRepository repo =
        AuthRepository(apiClient: api, secureStorage: storage);
    final EmailVerificationViewModel vm = EmailVerificationViewModel(repo)
      ..start(
        email: 'sv@uni.edu.vn',
        password: 'matkhau123',
        ticket:
            OtpTicket.fromJson(smtpOtpBody(), fallbackEmail: 'sv@uni.edu.vn'),
      );

    bool verified = false;
    await tester.pumpWidget(MaterialApp(
      home: EmailVerificationView(
        viewModel: vm,
        onVerified: () => verified = true,
        onGoToLogin: () {},
        onBack: () {},
      ),
    ));

    expect(find.byKey(const Key('otp_delivery_status_card')), findsOneWidget);
    expect(find.text('Đã gửi mã xác thực qua Email'), findsOneWidget);
    expect(find.byKey(const Key('otp_expiry_timer')), findsOneWidget);
    expect(find.text('Còn 05:00'), findsOneWidget);
    expect(find.textContaining('Chế độ phát triển'), findsNothing);

    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Còn 04:58'), findsOneWidget);

    await tester.tap(find.byKey(const Key('otp_paste_button')));
    await tester.pumpAndSettle();

    expect(verified, isTrue);
    expect(
        api.callsTo(ApiEndpoints.verifyOtp).single.data['otpCode'], '654321');
  });

  testWidgets('ForgotPasswordView & ResetPasswordView render email OTP UI',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);

    final ScriptedApiClient api = ScriptedApiClient()
      ..reply(ApiEndpoints.forgotPassword, smtpOtpBody());
    final AuthRepository repo = AuthRepository(
      apiClient: api,
      secureStorage: InMemorySecureStorage(),
    );
    final PasswordResetViewModel vm = PasswordResetViewModel(repo);

    bool openedReset = false;
    await tester.pumpWidget(MaterialApp(
      home: ForgotPasswordView(
        viewModel: vm,
        initialEmail: 'sv@uni.edu.vn',
        onOtpSent: () => openedReset = true,
        onBack: () {},
      ),
    ));

    expect(find.textContaining('hộp thư của bạn'), findsOneWidget);
    await tester.tap(find.byKey(const Key('forgot_submit')));
    await tester.pumpAndSettle();
    expect(openedReset, isTrue);

    await tester.pumpWidget(MaterialApp(
      home: ResetPasswordView(
        viewModel: vm,
        onPasswordReset: () {},
        onBack: () {},
      ),
    ));

    expect(find.byKey(const Key('otp_delivery_status_card')), findsOneWidget);
    expect(find.byKey(const Key('otp_paste_button')), findsOneWidget);
  });

  testWidgets(
      'EmailVerificationView hides status card when initial send failed cleanly',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);

    final AuthRepository repo = AuthRepository(
      apiClient: ScriptedApiClient(),
      secureStorage: InMemorySecureStorage(),
    );
    final EmailVerificationViewModel vm = EmailVerificationViewModel(repo)
      ..start(
        email: 'sv@uni.edu.vn',
        password: 'matkhau123',
        initialError: 'Dịch vụ gửi email OTP chưa được cấu hình trên máy chủ',
      );

    await tester.pumpWidget(MaterialApp(
      home: EmailVerificationView(
        viewModel: vm,
        onVerified: () {},
        onGoToLogin: () {},
        onBack: () {},
      ),
    ));

    expect(find.byKey(const Key('otp_delivery_status_card')), findsNothing);
    expect(find.text('Dịch vụ gửi email OTP chưa được cấu hình trên máy chủ'),
        findsOneWidget);
  });
}
