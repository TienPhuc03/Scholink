import 'dart:async';
import 'dart:convert';
import 'dart:math';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/realtime/mqtt_manager.dart';
import '../../core/storage/secure_storage_helper.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'chat_model.dart';
import 'chat_repository.dart';

/// ViewModel managing state and operations for Realtime Chat in MVVM architecture (SCHOL-26).
class ChatViewModel extends BaseViewModel {
  final ChatRepository _repository;
  final MqttManager _mqttManager;
  final SecureStorageHelper _secureStorage;

  List<ChatRoomModel> _rooms = <ChatRoomModel>[];
  List<ChatMessageModel> _messages = <ChatMessageModel>[];
  ChatRoomModel? _selectedRoom;
  String? _currentUserId;

  /// Monotonic sequence cursor for the current active room.
  int _lastSeq = 0;

  /// Permission status in the current room (becomes false on 403/kicked/left team).
  bool _hasPermission = true;

  /// Room readiness status (ready when messages loaded and MQTT topic subscribed).
  bool _isReady = false;

  /// Active MQTT room topic currently subscribed.
  String? _activeMqttTopic;

  StreamSubscription<Map<String, String>>? _mqttSubscription;
  StreamSubscription<bool>? _connectionStatusSub;

  List<ChatRoomModel> get rooms => _rooms;
  List<ChatMessageModel> get messages => _messages;
  ChatRoomModel? get selectedRoom => _selectedRoom;
  String? get currentUserId => _currentUserId;
  int get lastSeq => _lastSeq;
  bool get hasPermission => _hasPermission;
  bool get isReady => _isReady;
  bool get isMqttConnected => _mqttManager.isConnected;

  ChatViewModel({
    required ChatRepository repository,
    required MqttManager mqttManager,
    required SecureStorageHelper secureStorage,
  })  : _repository = repository,
        _mqttManager = mqttManager,
        _secureStorage = secureStorage {
    _initMqttListeners();
  }

  void _initMqttListeners() {
    // 1. Listen for real-time messages broadcast over MQTT
    _mqttSubscription = _mqttManager.messageStream.listen((Map<String, String> data) {
      final String? topic = data['topic'];
      final String? payloadStr = data['payload'];

      if (topic != null && payloadStr != null) {
        _handleIncomingMqttMessage(topic, payloadStr);
      }
    });

    // 2. Listen for reconnection events to perform gap-recovery / catch-up via REST afterSeq
    _mqttManager.onAutoReconnected = () {
      if (_selectedRoom != null && _hasPermission) {
        catchUpMissingMessages();
      }
    };

    _connectionStatusSub = _mqttManager.connectionStatusStream.listen((bool connected) {
      notifyListeners();
    });
  }

  /// Handles incoming MQTT message payload, deduplicates, and merges into the UI.
  void _handleIncomingMqttMessage(String topic, String payloadStr) {
    try {
      final dynamic decoded = jsonDecode(payloadStr);
      if (decoded is! Map<String, dynamic>) return;

      final String roomId = (decoded['roomId'] ?? '') as String;

      // Check if message belongs to the current room
      if (_selectedRoom != null && _selectedRoom!.id == roomId) {
        final ChatMessageModel incoming = ChatMessageModel.fromJson(decoded);
        _mergeAndDeduplicateIncoming(incoming);

        // Update read cursor if user is actively in this room
        if (incoming.seq > _lastSeq) {
          _lastSeq = incoming.seq;
          _repository.markAsRead(roomId, _lastSeq);
        }
      }

      // Update room preview snippet and unread count in room list
      final int roomIndex = _rooms.indexWhere((ChatRoomModel r) => r.id == roomId);
      if (roomIndex != -1) {
        final ChatRoomModel current = _rooms[roomIndex];
        final String content = (decoded['content'] ?? '') as String;
        final int msgSeq = (decoded['seq'] ?? (current.lastSeq + 1)) as int;
        final bool isCurrentSelected = _selectedRoom?.id == roomId;

        _rooms[roomIndex] = current.copyWith(
          lastMessageSnippet: content,
          lastMessageAt: DateTime.now(),
          lastSeq: max(current.lastSeq, msgSeq),
          unreadCount: isCurrentSelected ? 0 : current.unreadCount + 1,
        );
        notifyListeners();
      }
    } catch (_) {
      // Ignored non-json payloads or notifications
    }
  }

  /// Merges a newly received message and eliminates duplicates by (clientMsgId, seq, id).
  void _mergeAndDeduplicateIncoming(ChatMessageModel incoming) {
    final List<ChatMessageModel> updated = List<ChatMessageModel>.from(_messages);

    // 1. Check if matches any existing pending optimistic message by clientMsgId
    if (incoming.clientMsgId != null && incoming.clientMsgId!.isNotEmpty) {
      final int pendingIndex = updated.indexWhere(
        (ChatMessageModel m) => m.clientMsgId == incoming.clientMsgId,
      );
      if (pendingIndex != -1) {
        updated[pendingIndex] = incoming.copyWith(sendStatus: MessageSendStatus.sent);
        _sortAndAssignMessages(updated);
        return;
      }
    }

    // 2. Check if already exists by id or seq (idempotent delivery)
    final bool alreadyExists = updated.any(
      (ChatMessageModel m) => (m.id.isNotEmpty && m.id == incoming.id) || (m.seq > 0 && m.seq == incoming.seq),
    );

    if (alreadyExists) return;

    updated.add(incoming.copyWith(sendStatus: MessageSendStatus.sent));
    _sortAndAssignMessages(updated);
  }

  /// Sorts messages in ascending order by sequence, keeping pending/failed messages at the bottom.
  void _sortAndAssignMessages(List<ChatMessageModel> list) {
    list.sort((ChatMessageModel a, ChatMessageModel b) {
      if (a.seq > 0 && b.seq > 0) {
        return a.seq.compareTo(b.seq);
      }
      if (a.seq > 0 && b.seq <= 0) return -1;
      if (a.seq <= 0 && b.seq > 0) return 1;
      return a.createdAt.compareTo(b.createdAt);
    });

    _messages = list;
    if (_messages.isNotEmpty) {
      final Iterable<int> seqs = _messages.where((ChatMessageModel m) => m.seq > 0).map((ChatMessageModel m) => m.seq);
      if (seqs.isNotEmpty) {
        _lastSeq = max(_lastSeq, seqs.reduce(max));
      }
    }
    notifyListeners();
  }

  Future<void> initUser() async {
    _currentUserId = await _secureStorage.getUserId();
    if (_currentUserId != null && !_mqttManager.isConnected) {
      await _mqttManager.connect(_currentUserId!);
    }
  }

  Future<void> loadRooms() async {
    setLoading();
    await initUser();

    final Result<List<ChatRoomModel>, Failure> result = await _repository.getMyRooms();

    result.fold<void>(
      onSuccess: (List<ChatRoomModel> data) {
        _rooms = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  /// Opens a room, subscribes to its MQTT topic, loads history, and resets unread count.
  Future<void> selectRoom(ChatRoomModel room) async {
    // Unsubscribe from previous room if any
    if (_activeMqttTopic != null) {
      _mqttManager.unsubscribe(_activeMqttTopic!);
      _activeMqttTopic = null;
    }

    _selectedRoom = room;
    _hasPermission = true;
    _isReady = false;
    _lastSeq = 0;
    _messages = <ChatMessageModel>[];
    notifyListeners();

    // Subscribe to new room topic: scholink/rooms/{roomId}/messages
    _activeMqttTopic = 'scholink/rooms/${room.id}/messages';
    _mqttManager.subscribe(_activeMqttTopic!);

    // Load initial history
    await loadMessages(room.id);

    // Reset unread in UI and inform backend of read receipt
    final int idx = _rooms.indexWhere((ChatRoomModel r) => r.id == room.id);
    if (idx != -1) {
      _rooms[idx] = _rooms[idx].copyWith(unreadCount: 0, lastReadSeq: _lastSeq);
    }

    if (_lastSeq > 0) {
      _repository.markAsRead(room.id, _lastSeq);
    }

    _isReady = true;
    notifyListeners();
  }

  void clearSelectedRoom() {
    if (_activeMqttTopic != null) {
      _mqttManager.unsubscribe(_activeMqttTopic!);
      _activeMqttTopic = null;
    }
    _selectedRoom = null;
    _messages = <ChatMessageModel>[];
    _lastSeq = 0;
    _hasPermission = true;
    _isReady = false;
    notifyListeners();
  }

  /// Loads initial message history. Handles 403 Forbidden if user is kicked or left team.
  Future<void> loadMessages(String roomId, {bool showLoading = true}) async {
    if (showLoading) setLoading();

    final Result<List<ChatMessageModel>, Failure> result =
        await _repository.getMessages(roomId, limit: 50);

    result.fold<void>(
      onSuccess: (List<ChatMessageModel> data) {
        _hasPermission = true;
        _sortAndAssignMessages(data);
        setSuccess();
      },
      onFailure: (Failure failure) {
        if (failure.message.contains('403') || failure.message.contains('FORBIDDEN')) {
          _hasPermission = false;
          _isReady = false;
          if (_activeMqttTopic != null) {
            _mqttManager.unsubscribe(_activeMqttTopic!);
            _activeMqttTopic = null;
          }
          setError('Bạn không có quyền truy cập hoặc đã rời khỏi đội (403 Forbidden).');
        } else {
          setError(failure.message);
        }
      },
    );
  }

  /// Gap-recovery: When MQTT reconnects, query missing messages using afterSeq and merge.
  Future<void> catchUpMissingMessages() async {
    if (_selectedRoom == null || !_hasPermission) return;

    final Result<List<ChatMessageModel>, Failure> result = await _repository.getMessages(
      _selectedRoom!.id,
      afterSeq: _lastSeq,
      limit: 100,
    );

    result.fold<void>(
      onSuccess: (List<ChatMessageModel> newMsgs) {
        if (newMsgs.isNotEmpty) {
          final List<ChatMessageModel> merged = List<ChatMessageModel>.from(_messages);
          for (final ChatMessageModel msg in newMsgs) {
            final bool exists = merged.any(
              (ChatMessageModel m) => (m.id.isNotEmpty && m.id == msg.id) || (m.seq > 0 && m.seq == msg.seq),
            );
            if (!exists) {
              merged.add(msg);
            }
          }
          _sortAndAssignMessages(merged);

          if (_lastSeq > 0) {
            _repository.markAsRead(_selectedRoom!.id, _lastSeq);
          }
        }
      },
      onFailure: (Failure failure) {
        if (failure.message.contains('403')) {
          _hasPermission = false;
          _isReady = false;
          notifyListeners();
        }
      },
    );
  }

  /// Sends a message with an idempotent clientMsgId.
  /// Displays as Pending immediately, transitions to Sent upon ACK, or Failed on error.
  Future<bool> sendMessage(String content, {String? assetId}) async {
    if (_selectedRoom == null || !_hasPermission || !_isReady) return false;

    final String trimmed = content.trim();
    if (trimmed.isEmpty) return false;

    // Stable clientMsgId format: cmsg_<timestamp>_<random>
    final String clientMsgId =
        'cmsg_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(99999).toString().padLeft(5, '0')}';

    final ChatMessageModel pendingMsg = ChatMessageModel(
      id: 'temp_$clientMsgId',
      roomId: _selectedRoom!.id,
      senderId: _currentUserId ?? 'me',
      content: trimmed,
      seq: 0,
      clientMsgId: clientMsgId,
      assetId: assetId,
      createdAt: DateTime.now(),
      sendStatus: MessageSendStatus.pending,
    );

    // Optimistic UI update
    _messages.add(pendingMsg);
    notifyListeners();

    return _executeSendMessage(pendingMsg);
  }

  /// Retries sending a previously failed message using the SAME clientMsgId (Idempotent).
  Future<bool> retryMessage(ChatMessageModel failedMsg) async {
    if (_selectedRoom == null || !_hasPermission) return false;

    final int index = _messages.indexWhere((ChatMessageModel m) => m.clientMsgId == failedMsg.clientMsgId);
    if (index != -1) {
      _messages[index] = _messages[index].copyWith(
        sendStatus: MessageSendStatus.pending,
        errorMessage: null,
      );
      notifyListeners();
    }

    return _executeSendMessage(failedMsg);
  }

  Future<bool> _executeSendMessage(ChatMessageModel msg) async {
    final Result<ChatMessageModel, Failure> result = await _repository.sendMessage(
      roomId: msg.roomId,
      content: msg.content,
      clientMsgId: msg.clientMsgId!,
      assetId: msg.assetId,
    );

    return result.fold<bool>(
      onSuccess: (ChatMessageModel sent) {
        final int index = _messages.indexWhere(
          (ChatMessageModel m) => m.clientMsgId == msg.clientMsgId,
        );
        if (index != -1) {
          _messages[index] = sent.copyWith(sendStatus: MessageSendStatus.sent);
          _sortAndAssignMessages(_messages);
        }
        return true;
      },
      onFailure: (Failure failure) {
        final int index = _messages.indexWhere(
          (ChatMessageModel m) => m.clientMsgId == msg.clientMsgId,
        );
        if (index != -1) {
          if (failure.message.contains('403') || failure.message.contains('FORBIDDEN')) {
            _hasPermission = false;
            _isReady = false;
            _messages[index] = _messages[index].copyWith(
              sendStatus: MessageSendStatus.failed,
              errorMessage: 'Bạn đã mất quyền gửi tin trong phòng này (403).',
            );
          } else {
            _messages[index] = _messages[index].copyWith(
              sendStatus: MessageSendStatus.failed,
              errorMessage: failure.message,
            );
          }
          notifyListeners();
        }
        return false;
      },
    );
  }

  /// Handles user leaving the team or session revocation: unsubscribes topic and disables composer.
  void handleTeamLeft(String teamId) {
    if (_selectedRoom?.refId == teamId) {
      _hasPermission = false;
      _isReady = false;
      if (_activeMqttTopic != null) {
        _mqttManager.unsubscribe(_activeMqttTopic!);
        _activeMqttTopic = null;
      }
      notifyListeners();
    }
  }

  @override
  void dispose() {
    if (_activeMqttTopic != null) {
      _mqttManager.unsubscribe(_activeMqttTopic!);
      _activeMqttTopic = null;
    }
    _mqttSubscription?.cancel();
    _connectionStatusSub?.cancel();
    super.dispose();
  }
}
