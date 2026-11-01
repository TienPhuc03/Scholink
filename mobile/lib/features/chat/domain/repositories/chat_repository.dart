import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/chat_entity.dart';

abstract interface class ChatRepository {
  Future<Result<List<ChatRoomEntity>, Failure>> getMyRooms();
  Future<Result<List<ChatMessageEntity>, Failure>> getMessages(String roomId);
  Future<Result<ChatMessageEntity, Failure>> sendMessage({
    required String roomId,
    required String content,
    String? assetId,
  });
}
