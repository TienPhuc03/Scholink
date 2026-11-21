import 'dart:async';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'wallet_model.dart';
import 'wallet_repository.dart';

class WalletViewModel extends BaseViewModel {
  final WalletRepository _repository;

  WalletModel? _wallet;
  TopupOrderModel? _activeOrder;
  bool _isPolling = false;
  Timer? _pollingTimer;
  String? _actionMessage;

  WalletModel? get wallet => _wallet;
  TopupOrderModel? get activeOrder => _activeOrder;
  bool get isPolling => _isPolling;
  String? get actionMessage => _actionMessage;

  static const List<SkuItem> availableSkus = <SkuItem>[
    SkuItem(
      skuCode: 'PLUS_1_MONTH',
      name: 'Scholink Plus (1 Tháng)',
      priceVnd: 49000,
      description: 'Xuất Passport CV không watermark, mở khóa toàn bộ cơ hội học bổng.',
      badge: 'Phổ biến nhất',
    ),
    SkuItem(
      skuCode: 'PLUS_1_YEAR',
      name: 'Scholink Plus VIP (1 Năm)',
      priceVnd: 499000,
      description: 'Tiết kiệm 20%, ưu tiên nhắc hạn deadline độc quyền và hỗ trợ 1-1.',
      badge: 'Tiết kiệm 20%',
    ),
    SkuItem(
      skuCode: 'OPPORTUNITY_BOOST',
      name: 'Ghim Nổi Bật Cơ Hội (7 Ngày)',
      priceVnd: 99000,
      description: 'Ghim bài đăng học bổng/cuộc thi lên đầu trang chủ tìm kiếm.',
      badge: 'Dành cho Organizer',
    ),
    SkuItem(
      skuCode: 'VERIFICATION_BADGE',
      name: 'Huy Hiệu Xác Minh Học Thuật',
      priceVnd: 29000,
      description: 'Tích xanh chứng nhận hồ sơ đạt chuẩn và đã xác thực học vấn.',
      badge: 'Tích Xanh',
    ),
  ];

  WalletViewModel({required WalletRepository repository}) : _repository = repository;

  Future<void> loadWallet() async {
    setLoading();
    final Result<WalletModel, Failure> result = await _repository.getMyWallet();
    result.fold(
      onSuccess: (WalletModel data) {
        _wallet = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  Future<TopupOrderModel?> createTopup(int amountVnd, {String provider = 'PAYOS'}) async {
    setLoading();
    _actionMessage = null;
    final Result<TopupOrderModel, Failure> result = await _repository.createTopupOrder(
      amountVnd: amountVnd,
      provider: provider,
    );

    return result.fold(
      onSuccess: (TopupOrderModel order) {
        _activeOrder = order;
        setSuccess();
        startPolling(order.orderId);
        return order;
      },
      onFailure: (Failure failure) {
        setError(failure.message);
        return null;
      },
    );
  }

  void startPolling(String orderId) {
    stopPolling();
    _isPolling = true;
    notifyListeners();

    int attempts = 0;
    const int maxAttempts = 60; // 60 * 3s = 3 phút

    _pollingTimer = Timer.periodic(const Duration(seconds: 3), (Timer timer) async {
      attempts++;
      if (attempts >= maxAttempts) {
        stopPolling();
        return;
      }

      final Result<TopupOrderModel, Failure> result = await _repository.getOrderStatus(orderId);
      result.fold(
        onSuccess: (TopupOrderModel order) {
          _activeOrder = order;
          if (order.isSucceeded) {
            stopPolling();
            _actionMessage = 'Nạp thành công ${order.amountVnd} VND vào ví!';
            loadWallet(); // Cập nhật lại số dư ví mới
          } else if (order.isFailed) {
            stopPolling();
            setError('Đơn thanh toán đã bị hủy hoặc hết hạn.');
          }
          notifyListeners();
        },
        onFailure: (_) {},
      );
    });
  }

  void stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
    _isPolling = false;
    notifyListeners();
  }

  Future<bool> purchaseSku(String skuCode) async {
    setLoading();
    _actionMessage = null;
    final Result<Map<String, dynamic>, Failure> result = await _repository.purchaseSku(skuCode);

    return result.fold(
      onSuccess: (Map<String, dynamic> data) {
        _actionMessage = 'Kích hoạt gói dịch vụ thành công!';
        loadWallet();
        return true;
      },
      onFailure: (Failure failure) {
        setError(failure.message);
        return false;
      },
    );
  }

  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }
}
