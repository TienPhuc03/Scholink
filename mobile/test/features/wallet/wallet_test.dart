import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/network/api_client.dart';
import 'package:scholink_mobile/features/wallet/wallet_model.dart';
import 'package:scholink_mobile/features/wallet/wallet_repository.dart';
import 'package:scholink_mobile/features/wallet/wallet_view.dart';
import 'package:scholink_mobile/features/wallet/wallet_viewmodel.dart';

class MockApiClient implements ApiClient {
  Map<String, dynamic>? mockWalletResponse;
  Map<String, dynamic>? mockTopupResponse;
  Map<String, dynamic>? mockStatusResponse;
  Map<String, dynamic>? mockPurchaseResponse;

  @override
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, Options? options}) async {
    if (path.contains('/api/v1/wallet/entitlements')) {
      return Response<T>(
        data: <String, dynamic>{
          'activeSkus': <String>['PLUS_1_MONTH', 'VERIFICATION_BADGE'],
          'entitlements': <String, dynamic>{
            'hasPlus': true,
            'hasVerificationBadge': true,
            'hasOpportunityBoost': false,
            'plusExpiresAt': '2026-12-30T00:00:00.000Z',
          },
        } as T,
        statusCode: 200,
        requestOptions: RequestOptions(path: path),
      );
    }
    if (path.contains('/api/v1/wallet')) {
      return Response<T>(
        data: (mockWalletResponse ?? <String, dynamic>{
          'userId': 'usr_test_123',
          'balanceVnd': 200000,
          'heldVnd': 0,
          'availableVnd': 200000,
        }) as T,
        statusCode: 200,
        requestOptions: RequestOptions(path: path),
      );
    }
    if (path.contains('/api/v1/payments/orders')) {
      return Response<T>(
        data: (mockStatusResponse ?? <String, dynamic>{
          'orderId': 'pay_order_1',
          'orderCode': 123456,
          'amountVnd': 100000,
          'provider': 'PAYOS',
          'status': 'SUCCEEDED',
        }) as T,
        statusCode: 200,
        requestOptions: RequestOptions(path: path),
      );
    }
    throw UnimplementedError('GET $path');
  }

  @override
  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    if (path.contains('/api/v1/payments/topups')) {
      return Response<T>(
        data: (mockTopupResponse ?? <String, dynamic>{
          'orderId': 'pay_order_1',
          'orderCode': 123456,
          'amountVnd': 100000,
          'provider': 'PAYOS',
          'status': 'PENDING',
          'checkoutUrl': 'https://pay.scholink.edu.vn/checkout/pay_order_1',
          'qrCode': 'https://img.vietqr.io/image/mock.png',
        }) as T,
        statusCode: 201,
        requestOptions: RequestOptions(path: path),
      );
    }
    if (path.contains('/api/v1/wallet/purchases')) {
      return Response<T>(
        data: (mockPurchaseResponse ?? <String, dynamic>{
          'success': true,
          'skuCode': 'PLUS_1_MONTH',
          'priceVnd': 49000,
          'remainingBalanceVnd': 151000,
        }) as T,
        statusCode: 200,
        requestOptions: RequestOptions(path: path),
      );
    }
    throw UnimplementedError('POST $path');
  }

  @override
  Future<Response<T>> put<T>(String path, {dynamic data, Options? options}) => throw UnimplementedError();

  @override
  Future<Response<T>> patch<T>(String path, {dynamic data, Options? options}) => throw UnimplementedError();

  @override
  Future<Response<T>> delete<T>(String path, {dynamic data, Options? options}) => throw UnimplementedError();
}

void main() {
  group('Wallet Feature & PayOS VietQR Tests', () {
    late MockApiClient mockApi;
    late WalletRepository repository;
    late WalletViewModel viewModel;

    setUp(() {
      mockApi = MockApiClient();
      repository = WalletRepository(apiClient: mockApi);
      viewModel = WalletViewModel(repository: repository);
    });

    test('loadWallet loads balance correctly', () async {
      await viewModel.loadWallet();

      expect(viewModel.wallet, isNotNull);
      expect(viewModel.wallet!.balanceVnd, 200000);
      expect(viewModel.wallet!.availableVnd, 200000);
      expect(viewModel.hasError, isFalse);
    });

    test('loadWallet loads active entitlements correctly', () async {
      await viewModel.loadWallet();
      expect(viewModel.hasPlus, isTrue);
      expect(viewModel.hasVerificationBadge, isTrue);
      expect(viewModel.hasOpportunityBoost, isFalse);
      expect(viewModel.isSkuActive('PLUS_1_MONTH'), isTrue);
      expect(viewModel.isSkuActive('VERIFICATION_BADGE'), isTrue);
      expect(viewModel.isSkuActive('OPPORTUNITY_BOOST'), isFalse);
      expect(viewModel.getSkuExpiry('PLUS_1_MONTH'), isNotNull);
    });

    test('createTopup generates PayOS VietQR order', () async {
      final TopupOrderModel? order = await viewModel.createTopup(100000, provider: 'PAYOS');

      expect(order, isNotNull);
      expect(order!.orderCode, 123456);
      expect(order.amountVnd, 100000);
      expect(order.checkoutUrl, isNotEmpty);
      expect(order.qrCodeUrl, contains('vietqr.io'));
      expect(viewModel.isPolling, isTrue);

      viewModel.stopPolling();
      expect(viewModel.isPolling, isFalse);
    });

    test('purchaseSku deducts wallet balance successfully', () async {
      await viewModel.loadWallet();
      final bool success = await viewModel.purchaseSku('PLUS_1_MONTH');

      expect(success, isTrue);
      expect(viewModel.actionMessage, contains('thành công'));
    });

    test('preserves server Failure messages instead of falling through to unknown error', () async {
      final _FailingApiClient failingApi = _FailingApiClient();
      final WalletRepository repo = WalletRepository(apiClient: failingApi);
      final WalletViewModel vm = WalletViewModel(repository: repo);

      final bool ok = await vm.purchaseSku('PLUS_1_MONTH');
      expect(ok, isFalse);
      expect(vm.errorMessage, 'Số dư khả dụng không đủ để mua gói này');
      vm.dispose();
    });

    testWidgets('renders EMVCo PayOS qrCode string natively via QrImageView', (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);

      mockApi.mockTopupResponse = <String, dynamic>{
        'orderId': 'pay_emv_1',
        'orderCode': 789012,
        'amountVnd': 50000,
        'provider': 'PAYOS',
        'status': 'PENDING',
        'checkoutUrl': 'https://pay.payos.vn/web/emv',
        'qrCode': '00020101021238570010A000000727012700069704220113CAS0016304ABCD',
      };
      mockApi.mockPurchaseResponse = <String, dynamic>{
        'orderId': 'pay_emv_1',
        'orderCode': 789012,
        'amountVnd': 50000,
        'provider': 'PAYOS',
        'status': 'SUCCEEDED',
      };

      await tester.pumpWidget(MaterialApp(home: WalletView(viewModel: viewModel)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      await tester.tap(find.text('50k'));
      await tester.pump();
      await tester.tap(find.textContaining('Tạo Mã VietQR Nạp'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.byKey(const Key('payos_qr_matrix')), findsOneWidget);
      expect(find.byKey(const Key('reconcile_payment_button')), findsOneWidget);
      viewModel.stopPolling();
    });
  });
}

class _FailingApiClient extends MockApiClient {
  @override
  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) {
    throw const ServerFailure(
      message: 'Số dư khả dụng không đủ để mua gói này',
      code: 'INSUFFICIENT_FUNDS',
      statusCode: 422,
    );
  }
}
