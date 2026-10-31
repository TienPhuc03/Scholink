import '../../../../core/errors/failures.dart';
import '../../domain/entities/chat_entity.dart';
import '../dtos/chat_dtos.dart';

abstract final class ChatMapper {
  static ChatRoomEntity toRoomEntity(ChatRoomDto dto) {
    final String id = dto.id ?? '';
    if (id.isEmpty) {
      throw const ValidationFailure(message: 'Phòng chat thiếu mã định danh id.');
    }

    final String rawType = (dto.type ?? 'DIRECT').toUpperCase();
    final ChatRoomType type = rawType == 'TEAM' ? ChatRoomType.team : ChatRoomType.direct;

    DateTime? lastMsgAt;
    if (dto.lastMessageAt != null && dto.lastMessageAt!.isNotEmpty) {
      lastMsgAt = DateTime.tryParse(dto.lastMessageAt!);
    }

    return ChatRoomEntity(
      id: id,
      type: type,
      refId: dto.refId,
      participants: dto.participants ?? const <String>[],
      lastMessageSnippet: dto.lastMessageSnippet,
      lastMessageAt: lastMsgAt,
    );
  }

  static ChatMessageEntity toMessageEntity(ChatMessageDto dto) {
    final String id = dto.id ?? '';
    final String roomId = dto.roomId ?? '';
    final String senderId = dto.senderId ?? '';
    final String content = dto.content ?? '';

    if (id.isEmpty || roomId.isEmpty) {
      throw const ValidationFailure(message: 'Tin nhắn thiếu dữ liệu id hoặc roomId.');
    }

    DateTime created = DateTime.now();
    if (dto.createdAt != null && dto.createdAt!.isNotEmpty) {
      created = DateTime.tryParse(dto.createdAt!) ?? DateTime.now();
    }

    return ChatMessageEntity(
      id: id,
      roomId: roomId,
      senderId: senderId,
      content: content,
      assetId: dto.assetId,
      createdAt: created,
    );
  }
}
