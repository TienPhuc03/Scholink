enum ChatRoomType {
  direct,
  team,
}

/// Unified Chat Room Model for MVVM Architecture.
class ChatRoomModel {
  final String id;
  final ChatRoomType type;
  final String? refId;
  final List<String> participants;
  final String? lastMessageSnippet;
  final DateTime? lastMessageAt;

  const ChatRoomModel({
    required this.id,
    required this.type,
    this.refId,
    required this.participants,
    this.lastMessageSnippet,
    this.lastMessageAt,
  });

  bool get isTeamRoom => type == ChatRoomType.team;
  String get title => isTeamRoom ? 'Phòng Đội Thi #$refId' : 'Tin nhắn Trực tiếp';

  factory ChatRoomModel.fromJson(Map<String, dynamic> json) {
    final String typeStr = (json['type'] ?? 'DIRECT').toString().toUpperCase();
    final ChatRoomType type =
        typeStr == 'TEAM' ? ChatRoomType.team : ChatRoomType.direct;

    final dynamic rawParticipants = json['participants'];
    final List<String> participants = (rawParticipants is List)
        ? rawParticipants.map((dynamic e) => e.toString()).toList()
        : <String>[];

    return ChatRoomModel(
      id: (json['id'] ?? '') as String,
      type: type,
      refId: json['refId'] as String?,
      participants: participants,
      lastMessageSnippet: json['lastMessageSnippet'] as String?,
      lastMessageAt: json['lastMessageAt'] != null
          ? DateTime.tryParse(json['lastMessageAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'type': isTeamRoom ? 'TEAM' : 'DIRECT',
        'refId': refId,
        'participants': participants,
        'lastMessageSnippet': lastMessageSnippet,
        'lastMessageAt': lastMessageAt?.toIso8601String(),
      };
}

/// Unified Chat Message Model for MVVM Architecture.
class ChatMessageModel {
  final String id;
  final String roomId;
  final String senderId;
  final String content;
  final String? assetId;
  final DateTime createdAt;

  const ChatMessageModel({
    required this.id,
    required this.roomId,
    required this.senderId,
    required this.content,
    this.assetId,
    required this.createdAt,
  });

  bool isMe(String currentUserId) => senderId == currentUserId;

  factory ChatMessageModel.fromJson(Map<String, dynamic> json) {
    return ChatMessageModel(
      id: (json['id'] ?? '') as String,
      roomId: (json['roomId'] ?? '') as String,
      senderId: (json['senderId'] ?? '') as String,
      content: (json['content'] ?? '') as String,
      assetId: json['assetId'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'roomId': roomId,
        'senderId': senderId,
        'content': content,
        'assetId': assetId,
        'createdAt': createdAt.toIso8601String(),
      };
}

/// Backward compatibility aliases
typedef ChatRoomEntity = ChatRoomModel;
typedef ChatMessageEntity = ChatMessageModel;
