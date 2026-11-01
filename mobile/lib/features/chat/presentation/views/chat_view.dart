import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../domain/entities/chat_entity.dart';
import '../viewmodels/chat_viewmodel.dart';

class ChatView extends StatefulWidget {
  final ChatViewModel viewModel;

  const ChatView({
    super.key,
    required this.viewModel,
  });

  @override
  State<ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<ChatView> {
  final TextEditingController _messageController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.viewModel.loadRooms();
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  void _handleSendMessage() {
    final String text = _messageController.text.trim();
    if (text.isEmpty) return;
    _messageController.clear();
    widget.viewModel.sendMessage(text);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (BuildContext context, Widget? child) {
        final ChatRoomEntity? selectedRoom = widget.viewModel.selectedRoom;

        if (selectedRoom != null) {
          return _buildConversationScreen(selectedRoom);
        }

        return _buildRoomsListScreen();
      },
    );
  }

  Widget _buildRoomsListScreen() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Phòng Chat & Tin nhắn'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => widget.viewModel.loadRooms(),
          ),
        ],
      ),
      body: Builder(
        builder: (BuildContext context) {
          if (widget.viewModel.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (widget.viewModel.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    const Icon(Icons.error_outline, size: 48, color: AppColors.error),
                    const SizedBox(height: 12),
                    Text(
                      widget.viewModel.errorMessage ?? 'Không thể tải phòng chat',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textPrimary, fontSize: 15),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: () => widget.viewModel.loadRooms(),
                      child: const Text('Thử lại'),
                    ),
                  ],
                ),
              ),
            );
          }

          final List<ChatRoomEntity> rooms = widget.viewModel.rooms;
          if (rooms.isEmpty) {
            return const Center(
              child: Text(
                'Chưa có cuộc trò chuyện nào.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16.0),
            itemCount: rooms.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (BuildContext context, int index) {
              final ChatRoomEntity room = rooms[index];
              return Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: room.isTeamRoom
                        ? AppColors.primary.withOpacity(0.12)
                        : AppColors.secondary.withOpacity(0.12),
                    child: Icon(
                      room.isTeamRoom ? Icons.groups_rounded : Icons.person_rounded,
                      color: room.isTeamRoom ? AppColors.primary : AppColors.secondary,
                    ),
                  ),
                  title: Text(
                    room.title,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                  subtitle: Text(
                    room.lastMessageSnippet ?? 'Chưa có tin nhắn',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  ),
                  trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                  onTap: () => widget.viewModel.selectRoom(room),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildConversationScreen(ChatRoomEntity room) {
    final List<ChatMessageEntity> messages = widget.viewModel.messages;
    final String? currentUserId = widget.viewModel.currentUserId;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => widget.viewModel.clearSelectedRoom(),
        ),
        title: Text(room.title),
      ),
      body: Column(
        children: <Widget>[
          // Message List
          Expanded(
            child: messages.isEmpty
                ? const Center(
                    child: Text(
                      'Hãy gửi lời chào đầu tiên!',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16.0),
                    itemCount: messages.length,
                    itemBuilder: (BuildContext context, int index) {
                      final ChatMessageEntity msg = messages[index];
                      final bool isMe = currentUserId != null && msg.isMe(currentUserId);

                      return Align(
                        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 4.0),
                          padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 10.0),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.of(context).size.width * 0.75,
                          ),
                          decoration: BoxDecoration(
                            color: isMe ? AppColors.primary : AppColors.surface,
                            borderRadius: BorderRadius.only(
                              topLeft: const Radius.circular(12),
                              topRight: const Radius.circular(12),
                              bottomLeft: Radius.circular(isMe ? 12 : 0),
                              bottomRight: Radius.circular(isMe ? 0 : 12),
                            ),
                            border: isMe ? null : Border.all(color: AppColors.border),
                          ),
                          child: Text(
                            msg.content,
                            style: TextStyle(
                              color: isMe ? Colors.white : AppColors.textPrimary,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          const Divider(height: 1),

          // Message Input Field
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
            color: AppColors.surface,
            child: SafeArea(
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _handleSendMessage(),
                      decoration: const InputDecoration(
                        hintText: 'Nhập tin nhắn...',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.send_rounded, color: AppColors.primary),
                    onPressed: _handleSendMessage,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
