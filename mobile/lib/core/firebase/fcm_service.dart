import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../constants/api_endpoints.dart';
import '../network/api_client.dart';

/// Push over FCM (Android; iOS needs APNs, i.e. an Apple Developer account). Reaches the device
/// even when the app is closed, which MQTT cannot. While the app is open, [foregroundData] is
/// shown through PushListener, so the MQTT and FCM copies of one notification appear once.
class FcmService {
  final FirebaseMessaging _messaging;
  final ApiClient _api;
  final Stream<Map<String, dynamic>> _foreground;

  StreamSubscription<String>? _refresh;
  String? _sentToken;
  bool _permissionAsked = false;

  FcmService({
    required FirebaseMessaging messaging,
    required ApiClient apiClient,
    Stream<Map<String, dynamic>>? foregroundData,
  })  : _messaging = messaging,
        _api = apiClient,
        _foreground = foregroundData ??
            FirebaseMessaging.onMessage
                .map((RemoteMessage m) => m.data);

  /// Data of FCM messages received while the app is in the foreground.
  Stream<Map<String, dynamic>> get foregroundData => _foreground;

  /// After login and on resume: ties this device's token to the signed-in account.
  /// Safe to call repeatedly: the permission dialog is asked once per run and an
  /// unchanged token is not sent again.
  Future<void> register() async {
    try {
      if (!_permissionAsked) {
        _permissionAsked = true;
        await _messaging.requestPermission();
      }
      // getToken() is deprecated in firebase_messaging 17 but still returns the FCM
      // registration token the backend sends to; register()/onRegistered give an FID.
      // ignore: deprecated_member_use
      final String? token = await _messaging.getToken();
      if (token != null) await _send(token);
      // ignore: deprecated_member_use
      _refresh ??= _messaging.onTokenRefresh
          .listen((String t) => unawaited(_send(t)));
    } catch (e) {
      debugPrint('[FCM] Không đăng ký được thiết bị: $e');
    }
  }

  Future<void> _send(String token) async {
    if (token == _sentToken) return;
    try {
      await _api.post<dynamic>(ApiEndpoints.notificationDevices,
          data: <String, String>{'token': token, 'platform': 'android'});
      _sentToken = token;
    } catch (e) {
      debugPrint('[FCM] Gửi token lên máy chủ thất bại: $e');
    }
  }

  /// Session ended (logout, expiry, account deleted): delete this install's token so the
  /// previous account's pushes stop here; the server drops it on its next send (UNREGISTERED).
  Future<void> unregister() async {
    await _refresh?.cancel();
    _refresh = null;
    _sentToken = null;
    try {
      // ignore: deprecated_member_use
      await _messaging.deleteToken();
    } catch (e) {
      debugPrint('[FCM] Không xoá được token: $e');
    }
  }
}
