import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/features/auth/widgets/auth_widgets.dart';
import 'package:scholink_mobile/features/passport/passport_edit_view.dart';
import 'package:scholink_mobile/features/passport/passport_model.dart';
import 'package:scholink_mobile/features/passport/passport_repository.dart';
import 'package:scholink_mobile/features/passport/passport_validators.dart';
import 'package:scholink_mobile/features/passport/passport_viewmodel.dart';
import 'package:scholink_mobile/features/passport/profile_view_screen.dart';

import '../auth/auth_test_fakes.dart';
import 'passport_test.dart' show grpcPassport;

Finder field(String label) =>
    find.descendant(of: find.widgetWithText(AuthTextField, label), matching: find.byType(TextField));

Finder fieldIn(Key key) => find.descendant(of: find.byKey(key), matching: find.byType(TextField));

String textOf(WidgetTester tester, Finder f) => tester.widget<TextField>(f).controller!.text;

void main() {
  group('GPA and end year helpers', () {
    test('converts GPA linearly between the 4 and 10 scales', () {
      expect(PassportValidators.convertGpa('3.5', from: 4), '8.75');
      expect(PassportValidators.convertGpa('8,2', from: 10), '3.28');
      expect(PassportValidators.convertGpa('4', from: 4), '10');
      expect(PassportValidators.convertGpa('11', from: 10), isNull);
      expect(PassportValidators.convertGpa('', from: 4), isNull);
    });

    test('defaults the end year to start + 4 once the start year is valid', () {
      expect(PassportValidators.defaultEndYear('2024'), '2028');
      expect(PassportValidators.defaultEndYear('202'), isNull);
    });
  });

  group('PassportModel file links', () {
    test('parses the avatar URL and the CV file with its links', () {
      final PassportModel p = PassportModel.fromJson(<String, dynamic>{
        ...grpcPassport(),
        'avatarUrl': 'http://10.0.2.2:9000/a.png?sig',
        'cvFile': <String, dynamic>{
          'assetId': 'ast_cv',
          'fileName': 'cv.pdf',
          'mimeType': 'application/pdf',
          'sizeBytes': 250 * 1024,
          'viewUrl': 'http://v',
          'downloadUrl': 'http://d',
        },
      });
      expect(p.avatarUrl, 'http://10.0.2.2:9000/a.png?sig');
      expect(p.cvFile!.isPdf, isTrue);
      expect(p.cvFile!.summary, 'PDF · 250 KB');
    });

    test('a profile view drops the CV file when the viewer may not see the CV', () {
      final ProfileView v = ProfileView.fromJson(<String, dynamic>{
        'fullName': 'A',
        'visibleFields': <String>['bio'],
        'cvFile': <String, dynamic>{'assetId': 'ast_cv', 'fileName': 'cv.pdf'},
      });
      expect(v.cvFile, isNull);
    });
  });

  group('Passport edit form', () {
    late ScriptedApiClient api;

    Future<void> open(WidgetTester tester, Map<String, dynamic> passport) async {
      tester.view.physicalSize = const Size(800, 3200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      api.reply(ApiEndpoints.passport, passport);
      final PassportViewModel vm = PassportViewModel(PassportRepository(api));
      await vm.loadPassport();
      await tester.pumpWidget(MaterialApp(home: PassportEditView(viewModel: vm)));
      await tester.pumpAndSettle();
    }

    setUp(() => api = ScriptedApiClient());

    testWidgets('end year follows the start year until the user edits it', (WidgetTester tester) async {
      await open(tester, <String, dynamic>{...grpcPassport(), 'education': null});

      await tester.enterText(field('Năm bắt đầu'), '2024');
      expect(textOf(tester, field('Năm kết thúc')), '2028');
      await tester.enterText(field('Năm bắt đầu'), '2025');
      expect(textOf(tester, field('Năm kết thúc')), '2029');

      await tester.enterText(field('Năm kết thúc'), '2030');
      await tester.enterText(field('Năm bắt đầu'), '2026');
      expect(textOf(tester, field('Năm kết thúc')), '2030');
    });

    testWidgets('a saved "still studying" end year is not overwritten', (WidgetTester tester) async {
      await open(tester, grpcPassport()); // startYear 2023, no end year

      await tester.enterText(field('Năm bắt đầu'), '2024');
      expect(textOf(tester, field('Năm kết thúc')), '');
    });

    testWidgets('GPA fields convert each other and save on the scale typed last', (WidgetTester tester) async {
      await open(tester, grpcPassport());
      api.reply(ApiEndpoints.passport, grpcPassport(version: 4));

      await tester.enterText(fieldIn(const Key('passport_gpa_4')), '3.5');
      await tester.pump();
      expect(textOf(tester, fieldIn(const Key('passport_gpa_10'))), '8.75');

      await tester.enterText(fieldIn(const Key('passport_gpa_10')), '9');
      await tester.pump();
      expect(textOf(tester, fieldIn(const Key('passport_gpa_4'))), '3.6');

      await tester.tap(find.byKey(const Key('passport_save')));
      await tester.pumpAndSettle();
      final RecordedCall save = api.calls.lastWhere((RecordedCall c) => c.method == 'PUT');
      expect(save.data['education']['gpa'], 9);
      expect(save.data['education']['gpaScale'], 10);
    });

    testWidgets('region suggestions load, can be picked, and say when nothing matches', (WidgetTester tester) async {
      await open(tester, grpcPassport());
      api.handlers[ApiEndpoints.profileSuggestions] = (RecordedCall c) => <String, dynamic>{
            'suggestions': c.query!['q'] == 'zz'
                ? <dynamic>[]
                : <Map<String, String>>[
                    <String, String>{'value': 'Hà Nội', 'detail': 'VN-HN'},
                  ],
          };

      await tester.enterText(fieldIn(const Key('passport_region')), 'ha');
      await tester.pump();
      expect(find.text('Đang tìm gợi ý...'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 350));
      expect(api.callsTo(ApiEndpoints.profileSuggestions).single.query!['field'], 'region');

      await tester.tap(find.byKey(const Key('suggestion_Hà Nội')));
      await tester.pump();
      expect(textOf(tester, fieldIn(const Key('passport_region'))), 'Hà Nội');
      expect(find.byKey(const Key('suggestion_box')), findsNothing);

      await tester.enterText(fieldIn(const Key('passport_region')), 'zz');
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.textContaining('Không có gợi ý phù hợp'), findsOneWidget);
    });

    testWidgets('major suggestions are asked for the chosen institution', (WidgetTester tester) async {
      await open(tester, grpcPassport());
      api.reply(ApiEndpoints.profileSuggestions, <String, dynamic>{'suggestions': <dynamic>[]});

      await tester.enterText(fieldIn(const Key('passport_major')), 'khoa');
      await tester.pump(const Duration(milliseconds: 350));
      final Map<String, dynamic> q = api.callsTo(ApiEndpoints.profileSuggestions).last.query!;
      expect(q['field'], 'major');
      expect(q['institution'], 'ĐH Bách Khoa');
    });
  });

  testWidgets('another viewer sees the CV file with view and download actions', (WidgetTester tester) async {
    final ProfileViewViewModel vm = ProfileViewViewModel(
      (_) async => await PassportRepository(ScriptedApiClient()..reply(ApiEndpoints.passportView, <String, dynamic>{
                'fullName': 'Nguyễn Văn A',
                'visibleFields': <String>['cv'],
                'cvAssetId': 'ast_cv',
                'cvFile': <String, dynamic>{
                  'assetId': 'ast_cv',
                  'fileName': 'CV_NguyenVanA.pdf',
                  'mimeType': 'application/pdf',
                  'sizeBytes': 2048,
                  'viewUrl': 'http://10.0.2.2:9000/v',
                  'downloadUrl': 'http://10.0.2.2:9000/d',
                },
              }))
          .previewMyProfile(ProfileAudience.teammates),
    );
    final List<String> fetched = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: ProfileViewScreen(
        viewModel: vm,
        title: 'Hồ sơ',
        // The PDF renderer is a platform plugin; here the download fails and the fallback shows.
        cvLoader: (String url) async {
          fetched.add(url);
          throw Exception('offline');
        },
      ),
    ));
    await tester.pumpAndSettle();

    // The CV is fetched for the inline preview without any tap, from the inline (view) link.
    expect(fetched, <String>['http://10.0.2.2:9000/v']);
    expect(find.byKey(const Key('cv_preview')), findsOneWidget);
    expect(find.textContaining('Không hiển thị được CV'), findsOneWidget);
    expect(find.text('CV_NguyenVanA.pdf'), findsOneWidget);
    expect(find.text('PDF · 2 KB'), findsOneWidget);
    expect(find.byKey(const Key('file_link_view')), findsOneWidget);
    expect(find.byKey(const Key('file_link_download')), findsOneWidget);
    expect(find.text('Đã đính kèm'), findsNothing);
  });

  testWidgets('FileLinkTile asks for fresh links on every tap, never opens the stale ones', (WidgetTester tester) async {
    const FileLink stale = FileLink(
      assetId: 'ast_cv',
      fileName: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      viewUrl: 'http://v/expired',
      downloadUrl: 'http://d/expired',
    );
    final List<Uri> opened = <Uri>[];
    int refreshes = 0;
    FileLink? next = const FileLink(
      assetId: 'ast_cv',
      fileName: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      viewUrl: 'http://v/fresh',
      downloadUrl: 'http://d/fresh',
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: FileLinkTile(
          file: stale,
          refresh: () async {
            refreshes++;
            return next;
          },
          open: (Uri u) async {
            opened.add(u);
            return true;
          },
        ),
      ),
    ));

    await tester.tap(find.byKey(const Key('file_link_view')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('file_link_download')));
    await tester.pump();
    expect(refreshes, 2);
    expect(opened.map((Uri u) => u.toString()), <String>['http://v/fresh', 'http://d/fresh']);

    // Reload failed (offline): nothing is opened and the user is told.
    next = null;
    await tester.tap(find.byKey(const Key('file_link_view')));
    await tester.pump();
    expect(opened, hasLength(2));
    expect(find.textContaining('Không mở được tệp'), findsOneWidget);
  });

  test('PassportViewModel.freshCvLink reloads the Passport and returns the new CV links', () async {
    final ScriptedApiClient api = ScriptedApiClient()
      ..reply(ApiEndpoints.passport, <String, dynamic>{
        ...grpcPassport(),
        'cvFile': <String, dynamic>{'assetId': 'ast_cv', 'fileName': 'cv.pdf', 'viewUrl': 'http://v/1'},
      });
    final PassportViewModel vm = PassportViewModel(PassportRepository(api));
    await vm.loadPassport();
    api.reply(ApiEndpoints.passport, <String, dynamic>{
      ...grpcPassport(),
      'cvFile': <String, dynamic>{'assetId': 'ast_cv', 'fileName': 'cv.pdf', 'viewUrl': 'http://v/2'},
    });

    expect((await vm.freshCvLink())?.viewUrl, 'http://v/2');
    expect(vm.passport?.cvFile?.viewUrl, 'http://v/2');
    expect(vm.isLoading, isFalse);
  });
}
