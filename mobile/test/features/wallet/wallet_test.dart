import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/network/api_client.dart';
import 'package:scholink_mobile/features/wallet/wallet_model.dart';
import 'package:scholink_mobile/features/wallet/wallet_repository.dart';
import 'package:scholink_mobile/features/wallet/wallet_viewmodel.dart';

class MockApiClient implements ApiClient {
  Map<String, dynamic>? mockWalletResponse;
  Map<String, dynamic>? mockTopupResponse;
  Map<String, dynamic>? mockStatusResponse;
  Map<String, dynamic>? mockPurchaseResponse;

  @override
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, Options? options}) async {
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
  });
}
