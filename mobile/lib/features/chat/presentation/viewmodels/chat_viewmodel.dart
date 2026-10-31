import 'dart:async';
import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../../../core/realtime/mqtt_manager.dart';
import '../../../../core/storage/secure_storage_helper.dart';
import '../../../../core/viewmodels/base_viewmodel.dart';
import '../../domain/entities/chat_entity.dart';
import '../../domain/usecases/chat_usecases.dart';

class ChatViewModel extends BaseViewModel {
  final GetChatRoomsUseCase _getRoomsUseCase;
  final GetMessagesUseCase _getMessagesUseCase;
  final SendMessageUseCase _sendMessageUseCase;
  final MqttManager _mqttManager;
  final SecureStorageHelper _secureStorage;

  List<ChatRoomEntity> _rooms = <ChatRoomEntity>[];
  List<ChatMessageEntity> _messages = <ChatMessageEntity>[];
  ChatRoomEntity? _selectedRoom;
  String? _currentUserId;
  StreamSubscription<Map<String, String>>? _mqttSubscription;

  List<ChatRoomEntity> get rooms => _rooms;
  List<ChatMessageEntity> get messages => _messages;
  ChatRoomEntity? get selectedRoom => _selectedRoom;
  String? get currentUserId => _currentUserId;

  ChatViewModel({
    required GetChatRoomsUseCase getRoomsUseCase,
    required GetMessagesUseCase getMessagesUseCase,
    required SendMessageUseCase sendMessageUseCase,
    required MqttManager mqttManager,
    required SecureStorageHelper secureStorage,
  })  : _getRoomsUseCase = getRoomsUseCase,
        _getMessagesUseCase = getMessagesUseCase,
        _sendMessageUseCase = sendMessageUseCase,
        _mqttManager = mqttManager,
        _secureStorage = secureStorage {
    _initMqttListener();
  }

  void _initMqttListener() {
    _mqttSubscription = _mqttManager.messageStream.listen((Map<String, String> data) {
      final String? topic = data['topic'];
      final String? payload = data['payload'];

      if (topic != null && payload != null) {
        // When message arrives on user chat topic, reload messages if room active
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

    final Result<List<ChatRoomEntity>, Failure> result = await _getRoomsUseCase();

    result.fold<void>(
      onSuccess: (List<ChatRoomEntity> data) {
        _rooms = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  Future<void> selectRoom(ChatRoomEntity room) async {
    _selectedRoom = room;
    await loadMessages(room.id);
  }

  void clearSelectedRoom() {
    _selectedRoom = null;
    _messages = <ChatMessageEntity>[];
    notifyListeners();
  }

  Future<void> loadMessages(String roomId, {bool showLoading = true}) async {
    if (showLoading) setLoading();

    final Result<List<ChatMessageEntity>, Failure> result = await _getMessagesUseCase(roomId);

    result.fold<void>(
      onSuccess: (List<ChatMessageEntity> data) {
        _messages = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        if (showLoading) setError(failure.message);
      },
    );
  }

  Future<bool> sendMessage(String content) async {
    if (_selectedRoom == null) return false;

    final String roomId = _selectedRoom!.id;
    final Result<ChatMessageEntity, Failure> result = await _sendMessageUseCase(
      roomId: roomId,
      content: content,
    );

    return result.fold<bool>(
      onSuccess: (ChatMessageEntity message) {
        _messages = <ChatMessageEntity>[..._messages, message];
        notifyListeners();
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
