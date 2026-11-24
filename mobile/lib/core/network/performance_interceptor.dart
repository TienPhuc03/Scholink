import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_performance/firebase_performance.dart';

/// Firebase Performance does not see HTTP calls made from Dart: time each API request here.
class PerformanceInterceptor extends Interceptor {
  final FirebasePerformance _performance;

  PerformanceInterceptor(this._performance);

  static const String _metricKey = 'firebase_http_metric';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final HttpMethod? method =
        HttpMethod.values.asNameMap()[options.method.toLowerCase()];
    if (method != null) {
      try {
        final Uri u = options.uri;
        // Without the query: ids and filters there would split one endpoint into many entries.
        final HttpMetric metric = _performance.newHttpMetric(
            '${u.scheme}://${u.authority}${u.path}', method);
        options.extra[_metricKey] = metric;
        unawaited(metric.start());
      } catch (_) {
        // Never block a request because of monitoring.
      }
    }
    handler.next(options);
  }

  @override
  void onResponse(
      Response<dynamic> response, ResponseInterceptorHandler handler) {
    _stop(response.requestOptions, response.statusCode,
        response.headers.value(Headers.contentTypeHeader));
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _stop(err.requestOptions, err.response?.statusCode, null);
    handler.next(err);
  }

  void _stop(RequestOptions options, int? statusCode, String? contentType) {
    final Object? metric = options.extra.remove(_metricKey);
    if (metric is! HttpMetric) return;
    metric
      ..httpResponseCode = statusCode
      ..responseContentType = contentType;
    unawaited(metric.stop());
  }
}
