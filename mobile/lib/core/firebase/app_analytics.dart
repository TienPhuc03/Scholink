import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/widgets.dart';

import '../di/service_locator.dart';

/// Firebase Analytics. Every call does nothing when Firebase is not set up (widget tests, a build
/// without config), so features log without checking first.
abstract final class AppAnalytics {
  static FirebaseAnalytics? get _analytics =>
      sl.isRegistered<FirebaseAnalytics>() ? sl<FirebaseAnalytics>() : null;

  /// Screen views of pushed routes; they are named with RouteSettings (see AppRoutes).
  static List<NavigatorObserver> get observers {
    final FirebaseAnalytics? fa = _analytics;
    return fa == null
        ? const <NavigatorObserver>[]
        : <NavigatorObserver>[FirebaseAnalyticsObserver(analytics: fa)];
  }

  static Future<void> screen(String name) =>
      _run((FirebaseAnalytics fa) => fa.logScreenView(screenName: name));

  /// [name]: snake_case, at most 40 characters (Firebase rules).
  static Future<void> event(String name, [Map<String, Object>? parameters]) =>
      _run((FirebaseAnalytics fa) =>
          fa.logEvent(name: name, parameters: parameters));

  static Future<void> _run(
      Future<void> Function(FirebaseAnalytics fa) call) async {
    final FirebaseAnalytics? fa = _analytics;
    if (fa == null) return;
    try {
      await call(fa);
    } catch (e) {
      debugPrint('[Analytics] $e');
    }
  }
}
