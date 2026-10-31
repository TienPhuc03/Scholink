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
  void publish(String topic, String message);
  Stream<Map<String, String>> get messageStream;
  bool get isConnected;
}

/// Concrete implementation of MqttManager utilizing mqtt_server_client.
class MqttManagerImpl implements MqttManager {
  final String _server;
  final int _port;
  MqttServerClient? _client;
  final StreamController<Map<String, String>> _messageController =
      StreamController<Map<String, String>>.broadcast();

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
  Future<bool> connect(String userId) async {
    final String clientId = 'scholink_flutter_${userId}_${DateTime.now().millisecondsSinceEpoch}';
    final MqttServerClient client = MqttServerClient.withPort(_server, clientId, _port);
    _client = client;

    client.logging(on: false);
    client.keepAlivePeriod = 20;
    client.autoReconnect = true;

    final MqttConnectMessage connMessage = MqttConnectMessage()
        .withClientIdentifier(clientId)
        .startClean()
        .withWillQos(MqttQos.atLeastOnce);
    client.connectionMessage = connMessage;

    try {
      final MqttConnectionStatus? status = await client.connect();
      if (status?.state == MqttConnectionState.connected) {
        debugPrint('[MQTT] Connected successfully to $_server:$_port');

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
      client.disconnect();
    }
    return false;
  }

  @override
  void subscribe(String topic) {
    if (_client != null && isConnected) {
      _client!.subscribe(topic, MqttQos.atLeastOnce);
      debugPrint('[MQTT] Subscribed to topic: $topic');
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
    _client?.disconnect();
  }
}
