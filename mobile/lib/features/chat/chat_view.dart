import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'chat_model.dart';
import 'chat_viewmodel.dart';

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
  final ScrollController _scrollController = ScrollController();

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
    _scrollController.dispose();
    super.dispose();
  }

  void _handleSendMessage() {
    final String text = _messageController.text.trim();
    if (text.isEmpty) return;

    if (!widget.viewModel.hasPermission) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Bạn không có quyền gửi tin nhắn trong phòng này (403).'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    _messageController.clear();
    widget.viewModel.sendMessage(text);

    // Scroll down to the bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent + 80,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _showFileAttachmentPrompt() {
    if (!widget.viewModel.isReady || !widget.viewModel.hasPermission) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Chưa đủ quyền hoặc phòng chưa READY để đính kèm tệp.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (BuildContext ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Text(
                  'Đính Kèm Tài Liệu & Báo Cáo',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 12),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: AppColors.primary,
                    child: Icon(Icons.picture_as_pdf, color: Colors.white, size: 20),
                  ),
                  title: const Text('Tài liệu PDF / Báo cáo đề tài'),
                  subtitle: const Text('Dung lượng tối đa 10MB'),
                  onTap: () {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Tính năng đính kèm tệp PDF đã sẵn sàng!')),
                    );
                  },
                ),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: AppColors.secondary,
                    child: Icon(Icons.image, color: Colors.white, size: 20),
                  ),
                  title: const Text('Hình ảnh sơ đồ / Wireframe'),
                  subtitle: const Text('PNG, JPG định dạng ảnh chuẩn'),
                  onTap: () {
                    Navigator.pop(ctx);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (BuildContext context, Widget? child) {
        final ChatRoomModel? selectedRoom = widget.viewModel.selectedRoom;

        if (selectedRoom != null) {
          return _buildConversationScreen(selectedRoom);
        }

        return _buildRoomsListScreen();
      },
    );
  }

  // =========================================================================
  // 1. MÀN HÌNH DANH SÁCH PHÒNG CHAT (List phòng có Unread Badge)
  // =========================================================================
  Widget _buildRoomsListScreen() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tin Nhắn & Đội Thi'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Làm mới',
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

          final List<ChatRoomModel> rooms = widget.viewModel.rooms;
          if (rooms.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(Icons.chat_bubble_outline_rounded, size: 56, color: AppColors.textMuted),
                    SizedBox(height: 16),
                    Text(
                      'Chưa có cuộc trò chuyện nào.',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.textPrimary),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Khi bạn tạo đội hoặc tham gia một đội thi, phòng chat nội bộ sẽ tự động xuất hiện tại đây!',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                    ),
                  ],
                ),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => widget.viewModel.loadRooms(),
            child: ListView.separated(
              padding: const EdgeInsets.all(16.0),
              itemCount: rooms.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (BuildContext context, int index) {
                final ChatRoomModel room = rooms[index];
                return Card(
                  elevation: 1,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(
                      color: room.unreadCount > 0 ? AppColors.primary.withOpacity(0.4) : Colors.transparent,
                    ),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    leading: Badge(
                      isLabelVisible: room.unreadCount > 0,
                      label: Text('${room.unreadCount}'),
                      backgroundColor: AppColors.primary,
                      child: CircleAvatar(
                        radius: 22,
                        backgroundColor: room.isTeamRoom
                            ? AppColors.primary.withOpacity(0.12)
                            : AppColors.secondary.withOpacity(0.12),
                        child: Icon(
                          room.isTeamRoom ? Icons.groups_rounded : Icons.person_rounded,
                          color: room.isTeamRoom ? AppColors.primary : AppColors.secondary,
                        ),
                      ),
                    ),
                    title: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            room.title,
                            style: TextStyle(
                              fontWeight: room.unreadCount > 0 ? FontWeight.bold : FontWeight.w600,
                              fontSize: 15,
                              color: AppColors.textPrimary,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (room.lastMessageAt != null)
                          Text(
                            '${room.lastMessageAt!.hour}:${room.lastMessageAt!.minute.toString().padLeft(2, '0')}',
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                          ),
                      ],
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4.0),
                      child: Row(
                        children: <Widget>[
                          Expanded(
                            child: Text(
                              room.lastMessageSnippet ?? 'Chưa có tin nhắn nào',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: room.unreadCount > 0 ? AppColors.textPrimary : AppColors.textSecondary,
                                fontWeight: room.unreadCount > 0 ? FontWeight.w600 : FontWeight.normal,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          if (room.lastSeq > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.grey.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '#${room.lastSeq}',
                                style: const TextStyle(fontSize: 10, color: AppColors.textMuted, fontFamily: 'monospace'),
                              ),
                            ),
                        ],
                      ),
                    ),
                    onTap: () => widget.viewModel.selectRoom(room),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  // =========================================================================
  // 2. MÀN HÌNH CUỘC TRÒ CHUYỆN (Chat Screen với Monotonic Seq & ACK States)
  // =========================================================================
  Widget _buildConversationScreen(ChatRoomModel room) {
    final List<ChatMessageModel> messages = widget.viewModel.messages;
    final String? currentUserId = widget.viewModel.currentUserId;
    final bool hasPermission = widget.viewModel.hasPermission;
    final bool isReady = widget.viewModel.isReady;
    final bool isMqttConnected = widget.viewModel.isMqttConnected;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => widget.viewModel.clearSelectedRoom(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(room.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Row(
              children: <Widget>[
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isMqttConnected ? AppColors.success : AppColors.warning,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  isMqttConnected ? 'MQTT Realtime (Trực tuyến)' : 'Đang kết nối lại...',
                  style: TextStyle(
                    fontSize: 11,
                    color: isMqttConnected ? AppColors.success : AppColors.warning,
                  ),
                ),
                if (widget.viewModel.lastSeq > 0) ...<Widget>[
                  const SizedBox(width: 8),
                  Text(
                    'Seq: #${widget.viewModel.lastSeq}',
                    style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontFamily: 'monospace'),
                  ),
                ],
              ],
            ),
          ],
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Đồng bộ tin nhắn',
            onPressed: () => widget.viewModel.catchUpMissingMessages(),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          // Banner cảnh báo nếu mất quyền truy cập (403 / rời đội)
          if (!hasPermission)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: AppColors.error.withOpacity(0.12),
              child: const Row(
                children: <Widget>[
                  Icon(Icons.lock_person_outlined, color: AppColors.error, size: 20),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Bạn đã rời đội hoặc không có quyền truy cập phòng chat này (403 Forbidden).',
                      style: TextStyle(color: AppColors.error, fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),

          // Message List (Sắp xếp theo thứ tự seq tăng dần)
          Expanded(
            child: messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(Icons.forum_outlined, size: 48, color: Colors.grey.shade400),
                        const SizedBox(height: 12),
                        const Text(
                          'Hãy gửi lời chào đầu tiên tới đồng đội!',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
                    itemCount: messages.length,
                    itemBuilder: (BuildContext context, int index) {
                      final ChatMessageModel msg = messages[index];
                      final bool isMe = currentUserId != null && msg.isMe(currentUserId);

                      return _buildMessageBubble(msg, isMe);
                    },
                  ),
          ),
          const Divider(height: 1),

          // Text Composer & Action Controls
          _buildComposer(hasPermission, isReady),
        ],
      ),
    );
  }

  // =========================================================================
  // 3. BUBBLE TIN NHẮN (Hiển thị seq, trạng thái pending/sent/failed và retry)
  // =========================================================================
  Widget _buildMessageBubble(ChatMessageModel msg, bool isMe) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Column(
        crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: <Widget>[
          // Sender ID & Monotonic Sequence indicator
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4.0, vertical: 2.0),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (!isMe)
                  Text(
                    msg.senderId,
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textSecondary),
                  ),
                if (!isMe && msg.seq > 0) const SizedBox(width: 6),
                if (msg.seq > 0)
                  Text(
                    '#${msg.seq}',
                    style: TextStyle(
                      fontSize: 10,
                      fontFamily: 'monospace',
                      color: isMe ? AppColors.primary.withOpacity(0.8) : AppColors.textMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),

          // Message bubble content
          Row(
            mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              // Failed icon and Retry button for sender
              if (isMe && msg.isFailed)
                Padding(
                  padding: const EdgeInsets.only(right: 6.0),
                  child: IconButton(
                    icon: const Icon(Icons.refresh_rounded, color: AppColors.error, size: 22),
                    tooltip: 'Gửi lại tin nhắn',
                    onPressed: () => widget.viewModel.retryMessage(msg),
                  ),
                ),

              Container(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width * 0.72,
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 10.0),
                decoration: BoxDecoration(
                  color: isMe
                      ? (msg.isFailed ? AppColors.error.withOpacity(0.85) : AppColors.primary)
                      : AppColors.surface,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(14),
                    topRight: const Radius.circular(14),
                    bottomLeft: Radius.circular(isMe ? 14 : 0),
                    bottomRight: Radius.circular(isMe ? 0 : 14),
                  ),
                  border: isMe ? null : Border.all(color: AppColors.border),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color: Colors.black.withOpacity(0.04),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      msg.content,
                      style: TextStyle(
                        color: isMe ? Colors.white : AppColors.textPrimary,
                        fontSize: 14,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 4),

                    // Timestamp and ACK icon (Pending / Sent / Failed)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          '${msg.createdAt.hour}:${msg.createdAt.minute.toString().padLeft(2, '0')}',
                          style: TextStyle(
                            fontSize: 10,
                            color: isMe ? Colors.white.withOpacity(0.7) : AppColors.textMuted,
                          ),
                        ),
                        if (isMe) ...<Widget>[
                          const SizedBox(width: 4),
                          if (msg.isPending)
                            const SizedBox(
                              width: 11,
                              height: 11,
                              child: CircularProgressIndicator(strokeWidth: 1.5, color: Colors.white70),
                            )
                          else if (msg.isSent)
                            const Icon(Icons.done_all_rounded, size: 14, color: Colors.white)
                          else if (msg.isFailed)
                            const Icon(Icons.error_outline_rounded, size: 14, color: Colors.yellowAccent),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Error hint if failed
          if (isMe && msg.isFailed && msg.errorMessage != null)
            Padding(
              padding: const EdgeInsets.only(top: 2.0, right: 4.0),
              child: Text(
                msg.errorMessage!,
                style: const TextStyle(fontSize: 11, color: AppColors.error),
              ),
            ),
        ],
      ),
    );
  }

  // =========================================================================
  // 4. TEXT COMPOSER (Khóa action khi chưa READY hoặc mất quyền)
  // =========================================================================
  Widget _buildComposer(bool hasPermission, bool isReady) {
    final bool canInteract = hasPermission && isReady;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10.0, vertical: 8.0),
      color: AppColors.surface,
      child: SafeArea(
        child: Row(
          children: <Widget>[
            // Attachment Button: disabled when not READY or not authorized
            IconButton(
              icon: Icon(
                Icons.attach_file_rounded,
                color: canInteract ? AppColors.textSecondary : Colors.grey.shade400,
              ),
              tooltip: canInteract ? 'Đính kèm tệp' : 'Chưa sẵn sàng',
              onPressed: canInteract ? _showFileAttachmentPrompt : null,
            ),

            // Input TextField
            Expanded(
              child: TextField(
                controller: _messageController,
                enabled: canInteract,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _handleSendMessage(),
                decoration: InputDecoration(
                  hintText: canInteract
                      ? 'Nhập tin nhắn trao đổi...'
                      : (hasPermission ? 'Đang chuẩn bị phòng chat...' : 'Không có quyền gửi tin (403)...'),
                  hintStyle: TextStyle(
                    color: canInteract ? AppColors.textMuted : AppColors.error.withOpacity(0.6),
                    fontSize: 13,
                  ),
                  filled: true,
                  fillColor: Colors.grey.withOpacity(0.06),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 4),

            // Send Button
            IconButton(
              icon: Icon(
                Icons.send_rounded,
                color: canInteract ? AppColors.primary : Colors.grey.shade400,
              ),
              onPressed: canInteract ? _handleSendMessage : null,
            ),
          ],
        ),
      ),
    );
  }
}
