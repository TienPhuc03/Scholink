import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'wallet_model.dart';

class WalletRepository {
  final ApiClient _apiClient;
  static const Uuid _uuid = Uuid();

  WalletRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  Future<Result<WalletModel, Failure>> getMyWallet() async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(ApiEndpoints.wallet);
      if (response.statusCode == 200 && response.data != null) {
        final Map<String, dynamic> map = response.data is Map<String, dynamic>
            ? response.data as Map<String, dynamic>
            : Map<String, dynamic>.from(response.data as Map);
        return SuccessResult<WalletModel, Failure>(WalletModel.fromJson(map));
      }
      return FailureResult<WalletModel, Failure>(
        ServerFailure(message: 'Không thể lấy thông tin ví (Mã: ${response.statusCode})'),
      );
    } on Failure catch (failure) {
      return FailureResult<WalletModel, Failure>(failure);
    } on DioException catch (e) {
      final dynamic data = e.response?.data;
      final String msg = data is Map && data['message'] != null
          ? data['message'].toString()
          : (e.message ?? 'Lỗi kết nối khi tải số dư ví');
      return FailureResult<WalletModel, Failure>(ServerFailure(message: msg));
    } catch (e) {
      return FailureResult<WalletModel, Failure>(ServerFailure(message: 'Lỗi không xác định: $e'));
    }
  }

  Future<Result<EntitlementModel, Failure>> getEntitlements() async {
    try {
      final Response<dynamic> response =
          await _apiClient.get<dynamic>(ApiEndpoints.walletEntitlements);
      if (response.statusCode == 200 && response.data != null) {
        final Map<String, dynamic> map = response.data is Map<String, dynamic>
            ? response.data as Map<String, dynamic>
            : Map<String, dynamic>.from(response.data as Map);
        return SuccessResult<EntitlementModel, Failure>(EntitlementModel.fromJson(map));
      }
      return FailureResult<EntitlementModel, Failure>(
        ServerFailure(message: 'Không thể lấy thông tin đặc quyền (Mã: ${response.statusCode})'),
      );
    } on Failure catch (failure) {
      return FailureResult<EntitlementModel, Failure>(failure);
    } on DioException catch (e) {
      final dynamic data = e.response?.data;
      final String msg = data is Map && data['message'] != null
          ? data['message'].toString()
          : (e.message ?? 'Lỗi kết nối khi tải danh sách quyền lợi');
      return FailureResult<EntitlementModel, Failure>(ServerFailure(message: msg));
    } catch (e) {
      return FailureResult<EntitlementModel, Failure>(ServerFailure(message: 'Lỗi không xác định: $e'));
    }
  }

  Future<Result<TopupOrderModel, Failure>> createTopupOrder({
    required int amountVnd,
    String provider = 'PAYOS',
  }) async {
    try {
      final String idemKey = 'topup_${_uuid.v4()}';
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.topups,
        data: <String, dynamic>{
          'amountVnd': amountVnd,
          'provider': provider,
        },
        options: Options(
          headers: <String, dynamic>{
            'Idempotency-Key': idemKey,
          },
        ),
      );

      if ((response.statusCode == 200 || response.statusCode == 201) && response.data != null) {
        final Map<String, dynamic> map = response.data is Map<String, dynamic>
            ? response.data as Map<String, dynamic>
            : Map<String, dynamic>.from(response.data as Map);
        return SuccessResult<TopupOrderModel, Failure>(TopupOrderModel.fromJson(map));
      }
      return FailureResult<TopupOrderModel, Failure>(
        ServerFailure(message: 'Không thể khởi tạo đơn nạp (Mã: ${response.statusCode})'),
      );
    } on Failure catch (failure) {
      return FailureResult<TopupOrderModel, Failure>(failure);
    } on DioException catch (e) {
      final dynamic data = e.response?.data;
      final String msg = data is Map && data['message'] != null
          ? data['message'].toString()
          : (e.message ?? 'Lỗi kết nối khi tạo đơn nạp tiền');
      return FailureResult<TopupOrderModel, Failure>(ServerFailure(message: msg));
    } catch (e) {
      return FailureResult<TopupOrderModel, Failure>(ServerFailure(message: 'Lỗi hệ thống: $e'));
    }
  }

  Future<Result<TopupOrderModel, Failure>> getOrderStatus(String orderId) async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.orderStatus(orderId),
      );

      if (response.statusCode == 200 && response.data != null) {
        final Map<String, dynamic> map = response.data is Map<String, dynamic>
            ? response.data as Map<String, dynamic>
            : Map<String, dynamic>.from(response.data as Map);
        return SuccessResult<TopupOrderModel, Failure>(TopupOrderModel.fromJson(map));
      }
      return FailureResult<TopupOrderModel, Failure>(
        ServerFailure(message: 'Không thể tra cứu trạng thái đơn (Mã: ${response.statusCode})'),
      );
    } on Failure catch (failure) {
      return FailureResult<TopupOrderModel, Failure>(failure);
    } on DioException catch (e) {
      return FailureResult<TopupOrderModel, Failure>(
        ServerFailure(message: e.message ?? 'Lỗi kiểm tra trạng thái thanh toán'),
      );
    } catch (e) {
      return FailureResult<TopupOrderModel, Failure>(ServerFailure(message: 'Lỗi hệ thống: $e'));
    }
  }

  Future<Result<TopupOrderModel, Failure>> reconcileOrder(String orderId) async {
    try {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.reconcileOrder(orderId),
      );

      if ((response.statusCode == 200 || response.statusCode == 201) && response.data != null) {
        final Map<String, dynamic> map = response.data is Map<String, dynamic>
            ? response.data as Map<String, dynamic>
            : Map<String, dynamic>.from(response.data as Map);
        return SuccessResult<TopupOrderModel, Failure>(TopupOrderModel.fromJson(map));
      }
      return FailureResult<TopupOrderModel, Failure>(
        ServerFailure(message: 'Không thể đối soát trạng thái thanh toán (Mã: ${response.statusCode})'),
      );
    } on Failure catch (failure) {
      return FailureResult<TopupOrderModel, Failure>(failure);
    } on DioException catch (e) {
      return FailureResult<TopupOrderModel, Failure>(
        ServerFailure(message: e.message ?? 'Lỗi đối soát giao dịch PayOS'),
      );
    } catch (e) {
      return FailureResult<TopupOrderModel, Failure>(ServerFailure(message: 'Lỗi hệ thống: $e'));
    }
  }

  Future<Result<Map<String, dynamic>, Failure>> purchaseSku(String skuCode) async {
    try {
      final String idemKey = 'purchase_${_uuid.v4()}';
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.walletPurchases,
        data: <String, dynamic>{
          'skuCode': skuCode,
        },
        options: Options(
          headers: <String, dynamic>{
            'Idempotency-Key': idemKey,
          },
        ),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final Map<String, dynamic> map = response.data is Map<String, dynamic>
            ? response.data as Map<String, dynamic>
            : Map<String, dynamic>.from(response.data as Map? ?? <String, dynamic>{});
        return SuccessResult<Map<String, dynamic>, Failure>(map);
      }
      return FailureResult<Map<String, dynamic>, Failure>(
        ServerFailure(message: 'Không thể hoàn tất mua gói (Mã: ${response.statusCode})'),
      );
    } on Failure catch (failure) {
      return FailureResult<Map<String, dynamic>, Failure>(failure);
    } on DioException catch (e) {
      final dynamic data = e.response?.data;
      final String msg = data is Map && data['message'] != null
          ? data['message'].toString()
          : (e.message ?? 'Lỗi khi trừ tiền mua gói');
      return FailureResult<Map<String, dynamic>, Failure>(ServerFailure(message: msg));
    } catch (e) {
      return FailureResult<Map<String, dynamic>, Failure>(ServerFailure(message: 'Lỗi hệ thống: $e'));
    }
  }
}
