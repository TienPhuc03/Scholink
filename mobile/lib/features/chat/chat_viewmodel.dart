import 'dart:async';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/realtime/mqtt_manager.dart';
import '../../core/storage/secure_storage_helper.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'chat_model.dart';
import 'chat_repository.dart';

/// ViewModel managing state and operations for Realtime Chat in MVVM architecture.
class ChatViewModel extends BaseViewModel {
  final ChatRepository _repository;
  final MqttManager _mqttManager;
  final SecureStorageHelper _secureStorage;

  List<ChatRoomModel> _rooms = <ChatRoomModel>[];
  List<ChatMessageModel> _messages = <ChatMessageModel>[];
  ChatRoomModel? _selectedRoom;
  String? _currentUserId;
  StreamSubscription<Map<String, String>>? _mqttSubscription;

  List<ChatRoomModel> get rooms => _rooms;
  List<ChatMessageModel> get messages => _messages;
  ChatRoomModel? get selectedRoom => _selectedRoom;
  String? get currentUserId => _currentUserId;

  ChatViewModel({
    required ChatRepository repository,
    required MqttManager mqttManager,
    required SecureStorageHelper secureStorage,
  })  : _repository = repository,
        _mqttManager = mqttManager,
        _secureStorage = secureStorage {
    _initMqttListener();
  }

  void _initMqttListener() {
    _mqttSubscription = _mqttManager.messageStream.listen((Map<String, String> data) {
      final String? topic = data['topic'];
      final String? payload = data['payload'];

      if (topic != null && payload != null) {
        if (_selectedRoom != null) {
          loadMessages(_selectedRoom!.id, showLoading: false);
        }
      }
    });
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

  Future<void> selectRoom(ChatRoomModel room) async {
    _selectedRoom = room;
    await loadMessages(room.id);
  }

  void clearSelectedRoom() {
    _selectedRoom = null;
    _messages = <ChatMessageModel>[];
    notifyListeners();
  }

  Future<void> loadMessages(String roomId, {bool showLoading = true}) async {
    if (showLoading) setLoading();

    final Result<List<ChatMessageModel>, Failure> result =
        await _repository.getMessages(roomId);

    result.fold<void>(
      onSuccess: (List<ChatMessageModel> data) {
        _messages = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  Future<bool> sendMessage(String content, {String? assetId}) async {
    if (_selectedRoom == null) return false;

    final Result<ChatMessageModel, Failure> result = await _repository.sendMessage(
      roomId: _selectedRoom!.id,
      content: content,
      assetId: assetId,
    );

    return result.fold<bool>(
      onSuccess: (ChatMessageModel sent) {
        _messages = <ChatMessageModel>[..._messages, sent];
        setSuccess();
        return true;
      },
      onFailure: (Failure failure) {
        setError(failure.message);
        return false;
      },
    );
  }

  @override
  void dispose() {
    _mqttSubscription?.cancel();
    super.dispose();
  }
}
