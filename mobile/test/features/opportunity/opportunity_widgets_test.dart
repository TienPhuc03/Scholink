import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/database/local_cache_manager.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/network/api_client.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_detail_view.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_list_view.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_repository.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_viewmodel.dart';
import 'package:scholink_mobile/features/opportunity/widgets/opportunity_card.dart';
import 'package:dio/dio.dart';

class MockApiClient implements ApiClient {
  @override
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, Options? options}) async {
    throw DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.connectionError,
    );
  }

  @override
  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> put<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> patch<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> delete<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }
}

class InMemoryCacheManager implements LocalCacheManager {
  final Map<String, dynamic> _store = <String, dynamic>{};

  @override
  Future<void> clear() async => _store.clear();

  @override
  Future<dynamic> getJson(String key) async => _store[key];

  @override
  Future<String?> getString(String key) async => _store[key] as String?;

  @override
  Future<void> remove(String key) async => _store.remove(key);

  @override
  Future<void> saveJson(String key, dynamic data) async => _store[key] = data;

  @override
  Future<void> saveString(String key, String value) async => _store[key] = value;
}

void main() {
  group('Opportunity Widgets UI Tests (Tuần 1 & Tuần 2)', () {
    late OpportunityRepository repository;
    late OpportunityViewModel viewModel;

    setUp(() {
      final InMemoryCacheManager cache = InMemoryCacheManager();
      final RoomDatabase roomDb = RoomDatabaseImpl(cache);
      repository = OpportunityRepository(
        apiClient: MockApiClient(),
        roomDb: roomDb,
        localCache: cache,
      );
      viewModel = OpportunityViewModel(repository);
    });

    testWidgets('OpportunityCard renders scholarship properly with text deadline badge', (WidgetTester tester) async {
      final OpportunityModel opp = OpportunityModel(
        id: 'schol-card-1',
        type: OpportunityType.scholarship,
        title: 'Học bổng Xuất sắc 2026',
        description: 'Mô tả chi tiết',
        organizerName: 'Tổ chức ABC',
        applyMode: 'IN_APP',
        registerDeadline: DateTime.now().add(const Duration(days: 4)).toIso8601String(),
        tags: const <String>['IT', 'Full'],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OpportunityCard(item: opp),
          ),
        ),
      );

      expect(find.text('HỌC BỔNG'), findsOneWidget);
      expect(find.text('Nộp Online'), findsOneWidget);
      expect(find.text('Học bổng Xuất sắc 2026'), findsOneWidget);
      expect(find.text('Tổ chức ABC'), findsOneWidget);
      expect(find.textContaining('CÒN'), findsOneWidget);
      expect(find.text('#IT'), findsOneWidget);
    });

    testWidgets('OpportunityDetailView displays external mode with safe redirection dialog', (WidgetTester tester) async {
      final OpportunityModel extOpp = OpportunityModel(
        id: 'comp-ext-1',
        type: OpportunityType.competition,
        title: 'Cuộc thi Hackathon Quốc Tế',
        description: 'Mô tả cuộc thi',
        organizerName: 'Ban tổ chức Quốc tế',
        applyMode: 'EXTERNAL',
        registerDeadline: DateTime.now().add(const Duration(days: 3)).toIso8601String(),
        sourceUrl: 'https://hackathon.org/apply',
        eligibilityRules: const <String>['Sinh viên năm 1-4'],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: OpportunityDetailView(
            opportunity: extOpp,
            viewModel: viewModel,
          ),
        ),
      );

      expect(find.text('Chi tiết Cuộc thi'), findsOneWidget);
      expect(find.text('Đăng ký tại website nguồn'), findsOneWidget);
      expect(find.text('Tự đánh dấu đã nộp tại nguồn'), findsOneWidget);
      expect(find.text('https://hackathon.org/apply'), findsOneWidget);

      // Tap "Đăng ký tại website nguồn" -> verify safe redirection dialog opens
      await tester.tap(find.text('Đăng ký tại website nguồn'));
      await tester.pumpAndSettle();

      expect(find.text('Chuyển hướng an toàn'), findsOneWidget);
      expect(find.textContaining('Scholink tuyệt đối KHÔNG đính kèm Access Token'), findsOneWidget);
    });
  });
}

