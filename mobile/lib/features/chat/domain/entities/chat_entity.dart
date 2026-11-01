enum ChatRoomType {
  direct,
  team,
}

/// Non-nullable domain entity representing a chat room.
class ChatRoomEntity {
  final String id;
  final ChatRoomType type;
  final String? refId;
  final List<String> participants;
  final String? lastMessageSnippet;
  final DateTime? lastMessageAt;

  const ChatRoomEntity({
    required this.id,
    required this.type,
    this.refId,
    required this.participants,
    this.lastMessageSnippet,
    this.lastMessageAt,
  });

  bool get isTeamRoom => type == ChatRoomType.team;
  String get title => isTeamRoom ? 'Phòng Đội Thi #$refId' : 'Tin nhắn Trực tiếp';
}

/// Non-nullable domain entity representing a chat message.
class ChatMessageEntity {
  final String id;
  final String roomId;
  final String senderId;
  final String content;
  final String? assetId;
  final DateTime createdAt;

  const ChatMessageEntity({
    required this.id,
    required this.roomId,
    required this.senderId,
    required this.content,
    this.assetId,
    required this.createdAt,
  });

  bool isMe(String currentUserId) => senderId == currentUserId;
}
