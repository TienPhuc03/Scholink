/// API Error mapping model parsing standardized JSON errors from NestJS Gateway.
class ApiErrorModel {
  final String code;
  final String message;
  final List<dynamic>? details;
  final String? correlationId;

  const ApiErrorModel({
    required this.code,
    required this.message,
    this.details,
    this.correlationId,
  });

  factory ApiErrorModel.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const ApiErrorModel(
        code: 'UNKNOWN_ERROR',
        message: 'Đã xảy ra lỗi không xác định từ hệ thống.',
      );
    }

    final dynamic errorNode = json['error'] ?? json;
    if (errorNode is Map<String, dynamic>) {
      return ApiErrorModel(
        code: (errorNode['code'] as String?) ?? 'UNKNOWN_ERROR',
        message: (errorNode['message'] as String?) ?? 'Lỗi không xác định',
        details: errorNode['details'] as List<dynamic>?,
        correlationId: errorNode['correlationId'] as String?,
      );
    }

    return ApiErrorModel(
      code: (json['code'] as String?) ?? 'INTERNAL_SERVER_ERROR',
      message: (json['message'] as String?) ?? 'Lỗi kết nối máy chủ.',
      correlationId: json['correlationId'] as String?,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'code': code,
        'message': message,
        'details': details,
        'correlationId': correlationId,
      };
}
