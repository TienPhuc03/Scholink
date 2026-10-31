import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

/// Interceptor that automatically generates a unique UUID `Idempotency-Key`
/// for all mutating requests (POST, PUT, PATCH) to prevent duplicate transactions.
class IdempotencyInterceptor extends Interceptor {
  final Uuid _uuid;

  IdempotencyInterceptor({Uuid? uuid}) : _uuid = uuid ?? const Uuid();

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final String method = options.method.toUpperCase();
    if (method == 'POST' || method == 'PUT' || method == 'PATCH') {
      if (!options.headers.containsKey('Idempotency-Key')) {
        options.headers['Idempotency-Key'] = _uuid.v4();
      }
    }
    handler.next(options);
  }
}
