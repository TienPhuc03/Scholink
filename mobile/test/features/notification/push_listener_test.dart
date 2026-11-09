import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/device/device_services.dart';
import 'package:scholink_mobile/core/realtime/mqtt_manager.dart';
import 'package:scholink_mobile/features/notification/push_listener.dart';

class FakeMqtt implements MqttManager {
  final StreamController<Map<String, String>> ctrl = StreamController<Map<String, String>>.broadcast();
  bool connected = false;
  final List<String> connectedAs = <String>[];
  int disconnects = 0;

  void deliver(String topic, Object payload) =>
      ctrl.add(<String, String>{'topic': topic, 'payload': payload is String ? payload : jsonEncode(payload)});

  @override
  Future<bool> connect(String userId) async {
    connectedAs.add(userId);
    connected = true;
    return true;
  }

  @override
  void disconnect() {
    disconnects++;
    connected = false;
  }

  @override
  bool get isConnected => connected;

  @override
  Stream<Map<String, String>> get messageStream => ctrl.stream;

  @override
  void publish(String topic, String message) {}

  @override
  void subscribe(String topic) {}
}

class RecordingNotifier implements LocalNotifier {
  final List<Map<String, String?>> shown = <Map<String, String?>>[];

  @override
  Future<bool> show({required String id, required String title, required String body, String? refUrl}) async {
    shown.add(<String, String?>{'id': id, 'title': title, 'body': body, 'refUrl': refUrl});
    return true;
  }

  @override
  Future<String?> takeLaunchRefUrl() async => null;
}

Map<String, Object> push(String key) => <String, Object>{
      'kind': 'notification',
      'notificationKey': key,
      'title': 'Nhắc hạn: Học bổng A',
      'body': 'Còn 7 ngày',
      'refUrl': '/opportunities/opp_1',
    };

void main() {
  late FakeMqtt mqtt;
  late RecordingNotifier notifier;
  late PushListener listener;
  late int reloads;

  setUp(() {
    mqtt = FakeMqtt();
    notifier = RecordingNotifier();
    listener = PushListener(mqtt: mqtt, notifier: notifier);
    reloads = 0;
  });

  Future<void> flush() => Future<void>.delayed(Duration.zero);

  test('a push on my topic becomes a system notification and reloads the inbox', () async {
    await listener.start('u1', onReceived: () => reloads++);
    mqtt.deliver('users/u1/notifications', push('reminder:opp_1:7d:v1'));
    await flush();

    expect(mqtt.connectedAs, <String>['u1']);
    expect(notifier.shown.single['title'], 'Nhắc hạn: Học bổng A');
    expect(notifier.shown.single['refUrl'], '/opportunities/opp_1');
    expect(reloads, 1);
  });

  test('QoS 1 redelivery is shown once; other topics and bad payloads are ignored', () async {
    await listener.start('u1');
    mqtt.deliver('users/u1/notifications', push('k1'));
    mqtt.deliver('users/u1/notifications', push('k1'));
    mqtt.deliver('users/u2/notifications', push('k2'));
    mqtt.deliver('users/u1/chat', push('k3'));
    mqtt.deliver('users/u1/notifications', '{not json');
    mqtt.deliver('users/u1/notifications', <String, String>{'notificationKey': 'k4'}); // no title
    await flush();

    expect(notifier.shown.map((Map<String, String?> s) => s['id']), <String>['k1']);
  });

  test('logout stops showing that account\'s pushes and disconnects', () async {
    await listener.start('u1');
    await listener.stop();
    mqtt.deliver('users/u1/notifications', push('k1'));
    await flush();

    expect(notifier.shown, isEmpty);
    expect(mqtt.disconnects, 1);
    expect(listener.isListening, isFalse);
  });

  test('switching account reconnects as the new user', () async {
    await listener.start('u1');
    await listener.start('u2');
    mqtt.deliver('users/u1/notifications', push('old'));
    mqtt.deliver('users/u2/notifications', push('new'));
    await flush();

    expect(mqtt.connectedAs, <String>['u1', 'u2']);
    expect(notifier.shown.map((Map<String, String?> s) => s['id']), <String>['new']);
  });
}
