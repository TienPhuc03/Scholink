/// Model representing the user's digital wallet in Scholink.
/// Follows integer VND invariant (availableVnd = balanceVnd - heldVnd >= 0).
class WalletModel {
  final String userId;
  final int balanceVnd;
  final int heldVnd;
  final int availableVnd;

  const WalletModel({
    required this.userId,
    required this.balanceVnd,
    required this.heldVnd,
    required this.availableVnd,
  });

  factory WalletModel.fromJson(Map<String, dynamic> json) {
    return WalletModel(
      userId: json['userId']?.toString() ?? '',
      balanceVnd: (json['balanceVnd'] as num?)?.toInt() ?? 0,
      heldVnd: (json['heldVnd'] as num?)?.toInt() ?? 0,
      availableVnd: (json['availableVnd'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'userId': userId,
        'balanceVnd': balanceVnd,
        'heldVnd': heldVnd,
        'availableVnd': availableVnd,
      };
}

/// Model representing a payment/topup order.
class TopupOrderModel {
  final String orderId;
  final int orderCode;
  final int amountVnd;
  final String provider;
  final String status;
  final String? checkoutUrl;
  final String? qrCodeUrl;
  final int? currentBalanceVnd;

  const TopupOrderModel({
    required this.orderId,
    required this.orderCode,
    required this.amountVnd,
    required this.provider,
    required this.status,
    this.checkoutUrl,
    this.qrCodeUrl,
    this.currentBalanceVnd,
  });

  bool get isSucceeded => status == 'SUCCEEDED' || status == 'PAID';
  bool get isPending => status == 'PENDING' || status == 'CREATED';
  bool get isFailed => status == 'FAILED' || status == 'CANCELLED' || status == 'EXPIRED';

  factory TopupOrderModel.fromJson(Map<String, dynamic> json) {
    return TopupOrderModel(
      orderId: json['orderId']?.toString() ?? '',
      orderCode: (json['orderCode'] as num?)?.toInt() ?? 0,
      amountVnd: (json['amountVnd'] as num?)?.toInt() ?? 0,
      provider: json['provider']?.toString() ?? 'PAYOS',
      status: json['status']?.toString() ?? 'PENDING',
      checkoutUrl: json['checkoutUrl']?.toString(),
      qrCodeUrl: json['qrCode']?.toString() ?? json['qrCodeUrl']?.toString(),
      currentBalanceVnd: (json['currentBalanceVnd'] as num?)?.toInt(),
    );
  }
}

/// SKU Service Offering for Students & Organizers
class SkuItem {
  final String skuCode;
  final String name;
  final int priceVnd;
  final String description;
  final String badge;

  const SkuItem({
    required this.skuCode,
    required this.name,
    required this.priceVnd,
    required this.description,
    required this.badge,
  });
}
