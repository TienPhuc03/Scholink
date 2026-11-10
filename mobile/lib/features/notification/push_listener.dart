import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/device/device_services.dart';
import '../../core/realtime/mqtt_manager.dart';

/// Push channel over MQTT (F23/F29). The Notification Service publishes each reminder to
/// `users/<userId>/notifications`; while the app process is alive it shows a system notification
/// and asks the inbox to reload. A killed app gets the same items from its inbox on next open
/// (SRS: không hứa MQTT/worker sống liên tục).
class PushListener {
  final MqttManager _mqtt;
  final LocalNotifier _notifier;

  StreamSubscription<Map<String, String>>? _sub;
  String? _userId;
  void Function()? _onReceived;

  /// Each reminder milestone is shown once even when the broker delivers it again (QoS 1).
  final Set<String> _shown = <String>{};

  PushListener({required MqttManager mqtt, required LocalNotifier notifier})
      : _mqtt = mqtt,
        _notifier = notifier;

  String? get userId => _userId;
  bool get isListening => _sub != null;

  /// Starts listening for [userId]; [onReceived] runs after each new push (reload the inbox).
  Future<void> start(String userId, {void Function()? onReceived}) async {
    if (_userId == userId && _sub != null) {
      _onReceived = onReceived ?? _onReceived;
      return;
    }
    await stop();
    _userId = userId;
    _onReceived = onReceived;
    _sub = _mqtt.messageStream.listen(_handle);
    if (!_mqtt.isConnected) {
      // MqttManager subscribes users/<userId>/notifications when it connects.
      final bool ok = await _mqtt.connect(userId);
      if (!ok) debugPrint('[Push] MQTT chưa kết nối được; nhắc hạn vẫn có trong Hộp thư.');
    } else {
      _mqtt.subscribe('users/$userId/notifications');
    }
  }

  /// Logout / session end: stop showing this account's pushes on the device.
  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    if (_userId != null) _mqtt.disconnect();
    _userId = null;
    _onReceived = null;
    _shown.clear();
  }

  Future<void> _handle(Map<String, String> data) async {
    final String? uid = _userId;
    if (uid == null || data['topic'] != 'users/$uid/notifications') return;
    final Object? decoded;
    try {
      decoded = jsonDecode(data['payload'] ?? '');
    } catch (_) {
      return;
    }
    if (decoded is! Map) return;
    final String key = (decoded['notificationKey'] ?? decoded['notificationId'] ?? '').toString();
    final String title = (decoded['title'] ?? '').toString();
    if (key.isEmpty || title.isEmpty || !_shown.add(key)) return;

    await _notifier.show(
      id: key,
      title: title,
      body: (decoded['body'] ?? '').toString(),
      refUrl: decoded['refUrl']?.toString(),
    );
    _onReceived?.call();
  }
}
