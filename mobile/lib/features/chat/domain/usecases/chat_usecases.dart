import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/chat_entity.dart';
import '../repositories/chat_repository.dart';

class GetChatRoomsUseCase {
  final ChatRepository _repository;

  GetChatRoomsUseCase(this._repository);

  Future<Result<List<ChatRoomEntity>, Failure>> call() => _repository.getMyRooms();
}

class GetMessagesUseCase {
  final ChatRepository _repository;

  GetMessagesUseCase(this._repository);

  Future<Result<List<ChatMessageEntity>, Failure>> call(String roomId) =>
      _repository.getMessages(roomId);
}

class SendMessageUseCase {
  final ChatRepository _repository;

  SendMessageUseCase(this._repository);

  Future<Result<ChatMessageEntity, Failure>> call({
    required String roomId,
    required String content,
    String? assetId,
  }) {
    if (content.trim().isEmpty) {
      return Future<Result<ChatMessageEntity, Failure>>.value(
        const FailureResult<ChatMessageEntity, Failure>(
          ValidationFailure(message: 'Nội dung tin nhắn không được để trống.'),
        ),
      );
    }
    return _repository.sendMessage(
      roomId: roomId,
      content: content.trim(),
      assetId: assetId,
    );
  }
}
