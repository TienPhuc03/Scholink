/// Abstract base failure class for clean error propagation across architecture layers.
abstract class Failure {
  final String message;
  final String? code;
  final String? correlationId;

  const Failure({
    required this.message,
    this.code,
    this.correlationId,
  });

  @override
  String toString() => '$runtimeType(message: $message, code: $code, correlationId: $correlationId)';
}

class ServerFailure extends Failure {
  final int? statusCode;
  final dynamic details;

  const ServerFailure({
    required super.message,
    super.code,
    super.correlationId,
    this.statusCode,
    this.details,
  });
}

class NetworkFailure extends Failure {
  const NetworkFailure({
    super.message = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.',
    super.code = 'NETWORK_ERROR',
  });
}

class UnauthorizedFailure extends Failure {
  const UnauthorizedFailure({
    super.message = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    super.code = 'UNAUTHORIZED',
  });
}

class ValidationFailure extends Failure {
  final List<String> errors;

  const ValidationFailure({
    required super.message,
    this.errors = const [],
    super.code = 'VALIDATION_FAILED',
  });
}

class CacheFailure extends Failure {
  const CacheFailure({
    super.message = 'Không thể đọc hoặc ghi dữ liệu vào bộ nhớ cục bộ.',
    super.code = 'CACHE_ERROR',
  });
}
