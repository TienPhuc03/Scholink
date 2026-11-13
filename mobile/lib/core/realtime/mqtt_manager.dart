import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import '../constants/api_endpoints.dart';

/// Contract for real-time messaging using EMQX MQTT Broker.
abstract interface class MqttManager {
  Future<bool> connect(String userId);
  void disconnect();
  void subscribe(String topic);
  void unsubscribe(String topic);
  void publish(String topic, String message);
  Stream<Map<String, String>> get messageStream;
  Stream<bool> get connectionStatusStream;
  bool get isConnected;
  VoidCallback? onAutoReconnected;
}

/// Concrete implementation of MqttManager utilizing mqtt_server_client.
class MqttManagerImpl implements MqttManager {
  final String _server;
  final int _port;
  MqttServerClient? _client;
  final StreamController<Map<String, String>> _messageController =
      StreamController<Map<String, String>>.broadcast();
  final StreamController<bool> _statusController =
      StreamController<bool>.broadcast();

  final Set<String> _subscribedTopics = <String>{};

  @override
  VoidCallback? onAutoReconnected;

  MqttManagerImpl({
    String? server,
    int? port,
  })  : _server = server ?? ApiEndpoints.mqttBrokerUri,
        _port = port ?? ApiEndpoints.mqttPort;

  @override
  bool get isConnected =>
      _client?.connectionStatus?.state == MqttConnectionState.connected;

  @override
  Stream<Map<String, String>> get messageStream => _messageController.stream;

  @override
  Stream<bool> get connectionStatusStream => _statusController.stream;

  String? _userId;
  Future<bool>? _pending;

  /// Chat and the push listener both connect at startup: one connection per user, the second
  /// caller waits for the first instead of opening (and leaking) another socket.
  @override
  Future<bool> connect(String userId) {
    if (_userId == userId && isConnected) return Future<bool>.value(true);
    final Future<bool>? pending = _pending;
    if (_userId == userId && pending != null) return pending;
    if (_client != null) _client!.disconnect();
    _userId = userId;
    final Future<bool> attempt = _connect(userId);
    _pending = attempt;
    attempt.whenComplete(() {
      if (identical(_pending, attempt)) _pending = null;
    });
    return attempt;
  }

  Future<bool> _connect(String userId) async {
    final String clientId = 'scholink_flutter_${userId}_${DateTime.now().millisecondsSinceEpoch}';
    final MqttServerClient client = MqttServerClient.withPort(_server, clientId, _port);
    _client = client;

    client.logging(on: false);
    client.keepAlivePeriod = 20;
    client.autoReconnect = true;

    // Callbacks for connection monitoring
    client.onConnected = () {
      debugPrint('[MQTT] onConnected triggered');
      _statusController.add(true);
    };

    client.onDisconnected = () {
      debugPrint('[MQTT] onDisconnected triggered');
      _statusController.add(false);
    };

    client.onAutoReconnect = () {
      debugPrint('[MQTT] onAutoReconnect triggered - re-subscribing topics');
    };

    client.onAutoReconnected = () {
      debugPrint('[MQTT] onAutoReconnected successfully completed');
      _statusController.add(true);

      // Re-subscribe to all active topics after reconnect
      for (final String topic in _subscribedTopics) {
        client.subscribe(topic, MqttQos.atLeastOnce);
        debugPrint('[MQTT] Re-subscribed to topic: $topic');
      }

      // Trigger catch-up callback for chat gap-recovery
      onAutoReconnected?.call();
    };

    final MqttConnectMessage connMessage = MqttConnectMessage()
        .withClientIdentifier(clientId)
        .startClean()
        .withWillQos(MqttQos.atLeastOnce);
    client.connectionMessage = connMessage;

    try {
      final MqttClientConnectionStatus? status = await client.connect();
      if (status?.state == MqttConnectionState.connected) {
        debugPrint('[MQTT] Connected successfully to $_server:$_port');
        _statusController.add(true);

        // Subscribe to user private notification & chat topics
        subscribe('users/$userId/notifications');
        subscribe('users/$userId/chat');

        // Listen for incoming messages
        client.updates?.listen((List<MqttReceivedMessage<MqttMessage>> messages) {
          for (final MqttReceivedMessage<MqttMessage> msg in messages) {
            final MqttPublishMessage pubMsg = msg.payload as MqttPublishMessage;
            final String payload = MqttPublishPayload.bytesToStringAsString(
              pubMsg.payload.message,
            );
            _messageController.add(<String, String>{
              'topic': msg.topic,
              'payload': payload,
            });
          }
        });
        return true;
      }
    } catch (e) {
      debugPrint('[MQTT] Connection failed: $e');
      _statusController.add(false);
      client.disconnect();
    }
    return false;
  }

  @override
  void subscribe(String topic) {
    _subscribedTopics.add(topic);
    if (_client != null && isConnected) {
      _client!.subscribe(topic, MqttQos.atLeastOnce);
      debugPrint('[MQTT] Subscribed to topic: $topic');
    }
  }

  @override
  void unsubscribe(String topic) {
    _subscribedTopics.remove(topic);
    if (_client != null && isConnected) {
      _client!.unsubscribe(topic);
      debugPrint('[MQTT] Unsubscribed from topic: $topic');
    }
  }

  @override
  void publish(String topic, String message) {
    if (_client != null && isConnected) {
      final MqttClientPayloadBuilder builder = MqttClientPayloadBuilder();
      builder.addString(message);
      _client!.publishMessage(topic, MqttQos.atLeastOnce, builder.payload!);
    }
  }

  @override
  void disconnect() {
    _subscribedTopics.clear();
    _client?.disconnect();
    _client = null;
    _userId = null;
    _pending = null;
    _statusController.add(false);
  }
}
