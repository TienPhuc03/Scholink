enum ChatRoomType {
  direct,
  team,
}

enum MessageSendStatus {
  pending,
  sent,
  failed,
}

/// Unified Chat Room Model for MVVM Architecture.
class ChatRoomModel {
  final String id;
  final ChatRoomType type;
  final String? refId; // contextId (e.g. teamId)
  final String? name; // Friendly display name (e.g. team name)
  final List<String> participants;
  final String? lastMessageSnippet;
  final DateTime? lastMessageAt;
  final int lastSeq;
  final int lastReadSeq;
  final int unreadCount;

  const ChatRoomModel({
    required this.id,
    required this.type,
    this.refId,
    this.name,
    required this.participants,
    this.lastMessageSnippet,
    this.lastMessageAt,
    this.lastSeq = 0,
    this.lastReadSeq = 0,
    this.unreadCount = 0,
  });

  bool get isTeamRoom => type == ChatRoomType.team;
  String get title {
    if (name != null && name!.trim().isNotEmpty) return name!.trim();
    return isTeamRoom ? 'Phòng đội thi' : 'Tin nhắn trực tiếp';
  }

  /// Resolves an authentic, sleek avatar image URL for team or direct chat
  String get avatarImageUrl {
    if (isTeamRoom) {
      const List<String> teamAvatars = <String>[
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80',
        'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=200&q=80',
        'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=200&q=80',
        'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=200&q=80',
      ];
      final int hash = (id.isNotEmpty ? id : title).hashCode.abs();
      return teamAvatars[hash % teamAvatars.length];
    } else {
      const List<String> directAvatars = <String>[
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      ];
      final int hash = (id.isNotEmpty ? id : title).hashCode.abs();
      return directAvatars[hash % directAvatars.length];
    }
  }

  bool isMember(String studentId) => participants.contains(studentId);

  ChatRoomModel copyWith({
    String? id,
    ChatRoomType? type,
    String? refId,
    String? name,
    List<String>? participants,
    String? lastMessageSnippet,
    DateTime? lastMessageAt,
    int? lastSeq,
    int? lastReadSeq,
    int? unreadCount,
  }) {
    return ChatRoomModel(
      id: id ?? this.id,
      type: type ?? this.type,
      refId: refId ?? this.refId,
      name: name ?? this.name,
      participants: participants ?? this.participants,
      lastMessageSnippet: lastMessageSnippet ?? this.lastMessageSnippet,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      lastSeq: lastSeq ?? this.lastSeq,
      lastReadSeq: lastReadSeq ?? this.lastReadSeq,
      unreadCount: unreadCount ?? this.unreadCount,
    );
  }

  factory ChatRoomModel.fromJson(Map<String, dynamic> json) {
    final String typeStr = (json['contextType'] ?? json['type'] ?? 'DIRECT')
        .toString()
        .toUpperCase();
    final ChatRoomType type =
        typeStr == 'TEAM' ? ChatRoomType.team : ChatRoomType.direct;

    final dynamic rawParticipants = json['memberIds'] ?? json['participants'];
    final List<String> participants = (rawParticipants is List)
        ? rawParticipants.map((dynamic e) => e.toString()).toList()
        : <String>[];

    final String? roomName = (json['name'] ?? json['title']) as String?;

    return ChatRoomModel(
      id: (json['id'] ?? '') as String,
      type: type,
      refId: (json['contextId'] ?? json['refId']) as String?,
      name: roomName,
      participants: participants,
      lastMessageSnippet: json['lastMessageSnippet'] as String?,
      lastMessageAt: json['lastMessageAt'] != null
          ? DateTime.tryParse(json['lastMessageAt'].toString())
          : null,
      lastSeq: (json['lastSeq'] ?? 0) as int,
      lastReadSeq: (json['lastReadSeq'] ?? 0) as int,
      unreadCount: (json['unreadCount'] ?? 0) as int,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'type': isTeamRoom ? 'TEAM' : 'DIRECT',
        'refId': refId,
        'participants': participants,
        'lastMessageSnippet': lastMessageSnippet,
        'lastMessageAt': lastMessageAt?.toIso8601String(),
        'lastSeq': lastSeq,
        'lastReadSeq': lastReadSeq,
        'unreadCount': unreadCount,
      };
}

/// Unified Chat Message Model for MVVM Architecture.
class ChatMessageModel {
  final String id;
  final String roomId;
  final String senderId;
  final String content;
  final int seq;
  final String? clientMsgId;
  final String? assetId;
  final DateTime createdAt;
  final MessageSendStatus sendStatus;
  final String? errorMessage;

  const ChatMessageModel({
    required this.id,
    required this.roomId,
    required this.senderId,
    required this.content,
    this.seq = 0,
    this.clientMsgId,
    this.assetId,
    required this.createdAt,
    this.sendStatus = MessageSendStatus.sent,
    this.errorMessage,
  });

  bool isMe(String currentUserId) => senderId == currentUserId;
  bool get isPending => sendStatus == MessageSendStatus.pending;
  bool get isSent => sendStatus == MessageSendStatus.sent;
  bool get isFailed => sendStatus == MessageSendStatus.failed;

  ChatMessageModel copyWith({
    String? id,
    String? roomId,
    String? senderId,
    String? content,
    int? seq,
    String? clientMsgId,
    String? assetId,
    DateTime? createdAt,
    MessageSendStatus? sendStatus,
    String? errorMessage,
  }) {
    return ChatMessageModel(
      id: id ?? this.id,
      roomId: roomId ?? this.roomId,
      senderId: senderId ?? this.senderId,
      content: content ?? this.content,
      seq: seq ?? this.seq,
      clientMsgId: clientMsgId ?? this.clientMsgId,
      assetId: assetId ?? this.assetId,
      createdAt: createdAt ?? this.createdAt,
      sendStatus: sendStatus ?? this.sendStatus,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }

  factory ChatMessageModel.fromJson(Map<String, dynamic> json) {
    return ChatMessageModel(
      id: (json['id'] ?? json['messageId'] ?? '') as String,
      roomId: (json['roomId'] ?? '') as String,
      senderId: (json['senderId'] ?? '') as String,
      content: (json['content'] ?? '') as String,
      seq: (json['seq'] ?? 0) as int,
      clientMsgId: json['clientMsgId'] as String?,
      assetId: json['assetId'] as String?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      sendStatus: MessageSendStatus.sent,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'roomId': roomId,
        'senderId': senderId,
        'content': content,
        'seq': seq,
        'clientMsgId': clientMsgId,
        'assetId': assetId,
        'createdAt': createdAt.toIso8601String(),
      };
}

/// Backward compatibility aliases
typedef ChatRoomEntity = ChatRoomModel;
typedef ChatMessageEntity = ChatMessageModel;
