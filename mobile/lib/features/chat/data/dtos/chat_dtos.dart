/// Tier 1: Defensive Chat DTOs with all fields nullable.
class ChatRoomDto {
  final String? id;
  final String? type;
  final String? refId;
  final List<String>? participants;
  final String? lastMessageSnippet;
  final String? lastMessageAt;

  const ChatRoomDto({
    this.id,
    this.type,
    this.refId,
    this.participants,
    this.lastMessageSnippet,
    this.lastMessageAt,
  });

  factory ChatRoomDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const ChatRoomDto();

    final dynamic participantsRaw = json['participants'];
    final List<String> parsedParticipants = (participantsRaw is List)
        ? participantsRaw.map((dynamic p) => p.toString()).toList()
        : <String>[];

    return ChatRoomDto(
      id: json['id'] as String?,
      type: json['type'] as String?,
      refId: json['refId'] as String?,
      participants: parsedParticipants,
      lastMessageSnippet: json['lastMessageSnippet'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
    );
  }
}

class ChatMessageDto {
  final String? id;
  final String? roomId;
  final String? senderId;
  final String? content;
  final String? assetId;
  final String? createdAt;

  const ChatMessageDto({
    this.id,
    this.roomId,
    this.senderId,
    this.content,
    this.assetId,
    this.createdAt,
  });

  factory ChatMessageDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const ChatMessageDto();
    return ChatMessageDto(
      id: json['id'] as String?,
      roomId: json['roomId'] as String?,
      senderId: json['senderId'] as String?,
      content: json['content'] as String?,
      assetId: json['assetId'] as String?,
      createdAt: json['createdAt'] as String?,
    );
  }
}

class SendMessageRequestDto {
  final String content;
  final String? assetId;

  const SendMessageRequestDto({
    required this.content,
    this.assetId,
  });

  Map<String, dynamic> toJson() => <String, dynamic>{
        'content': content,
        if (assetId != null) 'assetId': assetId,
      };
}
