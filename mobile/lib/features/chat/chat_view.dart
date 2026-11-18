import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/constants/app_colors.dart';
import 'chat_model.dart';
import 'chat_viewmodel.dart';
import 'video_call_view.dart';

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
    _messageController.addListener(() {
      if (mounted) setState(() {});
    });
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
          content:
              Text('Bạn không có quyền gửi tin nhắn trong phòng này (403).'),
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

  Color _getAvatarColor(String id) {
    final List<Color> colors = <Color>[
      const Color(0xFF3925D7),
      const Color(0xFF0D9488),
      const Color(0xFFE11D48),
      const Color(0xFFD97706),
      const Color(0xFF7C3AED),
      const Color(0xFF059669),
      const Color(0xFF2563EB),
    ];
    int hash = 0;
    for (int i = 0; i < id.length; i++) {
      hash = id.codeUnitAt(i) + ((hash << 5) - hash);
    }
    return colors[hash.abs() % colors.length];
  }

  String _getInitials(String name) {
    final String clean = name.trim();
    if (clean.isEmpty) return '?';
    final List<String> parts = clean.split(RegExp(r'\s+'));
    if (parts.length > 1) {
      return (parts.first[0] + parts.last[0]).toUpperCase();
    }
    return clean.substring(0, clean.length >= 2 ? 2 : 1).toUpperCase();
  }

  Future<void> _pickAndSendImage(ImageSource source) async {
    if (!widget.viewModel.isReady || !widget.viewModel.hasPermission) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Phòng chưa sẵn sàng hoặc bạn không có quyền gửi ảnh.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    try {
      final ImagePicker picker = ImagePicker();
      final XFile? file = await picker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 50,
      );

      if (file == null) return;

      final Uint8List bytes = await file.readAsBytes();
      if (!mounted) return;
      if (bytes.isEmpty) return;

      if (bytes.length > 5 * 1024 * 1024) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content:
                Text('Kích thước ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.'),
            backgroundColor: AppColors.error,
          ),
        );
        return;
      }

      final String base64Image = base64Encode(bytes);
      await widget.viewModel.sendMessage('[image]$base64Image[/image]');

      // Auto scroll down to message
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent + 120,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Không thể chọn ảnh: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  bool _isImageMessage(String content) {
    return content.startsWith('[image]') && content.endsWith('[/image]');
  }

  Uint8List? _parseImageBytes(String content) {
    try {
      final String raw = content.substring(7, content.length - 8).trim();
      return base64Decode(raw);
    } catch (_) {
      return null;
    }
  }

  void _showFullScreenImage(Uint8List bytes) {
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.all(12),
          child: Stack(
            alignment: Alignment.center,
            children: <Widget>[
              InteractiveViewer(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.memory(bytes),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: IconButton(
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black54,
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
            ],
          ),
        );
      },
    );
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
                  'Đính Kèm & Phương Tiện',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 12),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: AppColors.primary,
                    child: Icon(Icons.photo_library_rounded,
                        color: Colors.white, size: 20),
                  ),
                  title: const Text('Thư viện ảnh điện thoại'),
                  subtitle: const Text('Chọn ảnh từ bộ sưu tập của bạn'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickAndSendImage(ImageSource.gallery);
                  },
                ),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF10B981),
                    child: Icon(Icons.camera_alt_rounded,
                        color: Colors.white, size: 20),
                  ),
                  title: const Text('Chụp ảnh bằng Camera'),
                  subtitle: const Text('Mở máy ảnh và chụp gửi ngay'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickAndSendImage(ImageSource.camera);
                  },
                ),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: AppColors.secondary,
                    child: Icon(Icons.picture_as_pdf,
                        color: Colors.white, size: 20),
                  ),
                  title: const Text('Tài liệu PDF / Báo cáo đề tài'),
                  subtitle: const Text('Dung lượng tối đa 10MB'),
                  onTap: () {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content:
                              Text('Tính năng đính kèm tệp PDF đã sẵn sàng!')),
                    );
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
                    const Icon(Icons.error_outline,
                        size: 48, color: AppColors.error),
                    const SizedBox(height: 12),
                    Text(
                      widget.viewModel.errorMessage ??
                          'Không thể tải phòng chat',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: AppColors.textPrimary, fontSize: 15),
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
                    Icon(Icons.chat_bubble_outline_rounded,
                        size: 56, color: AppColors.textMuted),
                    SizedBox(height: 16),
                    Text(
                      'Chưa có cuộc trò chuyện nào.',
                      style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: AppColors.textPrimary),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Khi bạn tạo đội hoặc tham gia một đội thi, phòng chat nội bộ sẽ tự động xuất hiện tại đây!',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: AppColors.textSecondary, fontSize: 13),
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
                      color: room.unreadCount > 0
                          ? AppColors.primary.withValues(alpha: 0.4)
                          : Colors.transparent,
                    ),
                  ),
                  child: ListTile(
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    leading: Badge(
                      isLabelVisible: room.unreadCount > 0,
                      label: Text('${room.unreadCount}'),
                      backgroundColor: AppColors.primary,
                      child: CircleAvatar(
                        radius: 22,
                        backgroundColor: _getAvatarColor(room.title),
                        child: Text(
                          _getInitials(room.title),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
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
                              fontWeight: room.unreadCount > 0
                                  ? FontWeight.bold
                                  : FontWeight.w600,
                              fontSize: 15,
                              color: AppColors.textPrimary,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (room.lastMessageAt != null)
                          Text(
                            '${room.lastMessageAt!.hour}:${room.lastMessageAt!.minute.toString().padLeft(2, '0')}',
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.textMuted),
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
                                color: room.unreadCount > 0
                                    ? AppColors.textPrimary
                                    : AppColors.textSecondary,
                                fontWeight: room.unreadCount > 0
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          if (room.lastSeq > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.grey.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '#${room.lastSeq}',
                                style: const TextStyle(
                                    fontSize: 10,
                                    color: AppColors.textMuted,
                                    fontFamily: 'monospace'),
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
        title: Row(
          children: <Widget>[
            CircleAvatar(
              radius: 17,
              backgroundColor: _getAvatarColor(room.title),
              child: Text(
                _getInitials(room.title),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 11.5,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    room.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary),
                  ),
                  Row(
                    children: <Widget>[
                      Container(
                        width: 6.5,
                        height: 6.5,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isMqttConnected
                              ? AppColors.success
                              : AppColors.warning,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        isMqttConnected ? 'Đã kết nối' : 'Đang kết nối lại...',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                          color: isMqttConnected
                              ? AppColors.success
                              : AppColors.warning,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.videocam_rounded,
                size: 24, color: AppColors.primary),
            tooltip: 'Gọi Video trao đổi nhóm',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => VideoCallView(
                    roomName: room.title,
                    roomId: room.id,
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 20),
            tooltip: 'Đồng bộ tin nhắn',
            onPressed: () => widget.viewModel.catchUpMissingMessages(),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          // Banner cảnh báo kết nối offline nếu mất mạng
          if (!isMqttConnected)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              color: const Color(0xFFFEF3C7),
              child: const Row(
                children: <Widget>[
                  Icon(Icons.wifi_off_rounded,
                      size: 14, color: Color(0xFFB45309)),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Mất kết nối mạng. Đang tự động kết nối lại...',
                      style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFFB45309),
                          fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),

          // Banner cảnh báo nếu mất quyền truy cập (403 / rời đội)
          if (!hasPermission)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: AppColors.error.withValues(alpha: 0.12),
              child: const Row(
                children: <Widget>[
                  Icon(Icons.lock_person_outlined,
                      color: AppColors.error, size: 20),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Bạn đã rời đội hoặc không có quyền truy cập phòng chat này (403 Forbidden).',
                      style: TextStyle(
                          color: AppColors.error,
                          fontSize: 13,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),

          // Message List (Sắp xếp theo thứ tự seq tăng dần)
          Expanded(
            child: messages.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(Icons.chat_bubble_outline_rounded,
                            size: 48, color: Color(0xFF9CA3AF)),
                        SizedBox(height: 12),
                        Text(
                          'Chưa có tin nhắn',
                          style: TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 15,
                              fontWeight: FontWeight.w600),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Bắt đầu cuộc trò chuyện bằng cách gửi lời nhắn đầu tiên tới đồng đội!',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: AppColors.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16.0, vertical: 12.0),
                    itemCount: messages.length,
                    itemBuilder: (BuildContext context, int index) {
                      final ChatMessageModel msg = messages[index];
                      final bool isMe =
                          currentUserId != null && msg.isMe(currentUserId);

                      return _buildMessageBubble(msg, isMe);
                    },
                  ),
          ),
          const Divider(height: 1, color: Color(0xFFE5E7EB)),

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
        crossAxisAlignment:
            isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: <Widget>[
          // Sender ID for other users
          if (!isMe)
            Padding(
              padding: const EdgeInsets.only(left: 34.0, bottom: 2.0),
              child: Text(
                msg.senderId,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _getAvatarColor(msg.senderId)),
              ),
            ),

          // Message bubble content
          Row(
            mainAxisAlignment:
                isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              // Teammate avatar for !isMe
              if (!isMe) ...<Widget>[
                CircleAvatar(
                  radius: 14,
                  backgroundColor: _getAvatarColor(msg.senderId),
                  child: Text(
                    _getInitials(msg.senderId),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
              ],

              // Failed icon and Retry button for sender
              if (isMe && msg.isFailed)
                Padding(
                  padding: const EdgeInsets.only(right: 6.0),
                  child: IconButton(
                    icon: const Icon(Icons.refresh_rounded,
                        color: AppColors.error, size: 22),
                    tooltip: 'Gửi lại tin nhắn',
                    onPressed: () => widget.viewModel.retryMessage(msg),
                  ),
                ),

              Container(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width * 0.72,
                ),
                padding: const EdgeInsets.symmetric(
                    horizontal: 14.0, vertical: 10.0),
                decoration: BoxDecoration(
                  color: isMe
                      ? (msg.isFailed
                          ? AppColors.error.withValues(alpha: 0.85)
                          : AppColors.primary)
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
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment:
                      isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: <Widget>[
                    if (_isImageMessage(msg.content)) ...<Widget>[
                      Builder(builder: (BuildContext ctx) {
                        final Uint8List? bytes = _parseImageBytes(msg.content);
                        if (bytes == null) {
                          return const Text(
                            '[Hình ảnh]',
                            style: TextStyle(fontStyle: FontStyle.italic),
                          );
                        }
                        return GestureDetector(
                          onTap: () => _showFullScreenImage(bytes),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.memory(
                              bytes,
                              width: 200,
                              height: 160,
                              fit: BoxFit.cover,
                            ),
                          ),
                        );
                      }),
                      const SizedBox(height: 4),
                    ] else ...<Widget>[
                      Text(
                        msg.content,
                        style: TextStyle(
                          color: isMe ? Colors.white : AppColors.textPrimary,
                          fontSize: 14,
                          height: 1.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],

                    // Timestamp and ACK icon (Pending / Sent / Failed)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          '${msg.createdAt.hour}:${msg.createdAt.minute.toString().padLeft(2, '0')}',
                          style: TextStyle(
                            fontSize: 10,
                            color: isMe
                                ? Colors.white.withValues(alpha: 0.7)
                                : AppColors.textMuted,
                          ),
                        ),
                        if (isMe) ...<Widget>[
                          const SizedBox(width: 4),
                          if (msg.isPending)
                            const SizedBox(
                              width: 11,
                              height: 11,
                              child: CircularProgressIndicator(
                                  strokeWidth: 1.5, color: Colors.white70),
                            )
                          else if (msg.isSent)
                            const Icon(Icons.done_all_rounded,
                                size: 14, color: Colors.white)
                          else if (msg.isFailed)
                            const Icon(Icons.error_outline_rounded,
                                size: 14, color: Colors.yellowAccent),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              // Sender avatar on the right for isMe
              if (isMe) ...<Widget>[
                const SizedBox(width: 6),
                CircleAvatar(
                  radius: 14,
                  backgroundColor: AppColors.primary,
                  child: Text(
                    _getInitials(widget.viewModel.currentUserId ?? 'Tôi'),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
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
    final bool hasText = _messageController.text.trim().isNotEmpty;
    final bool canSend = canInteract && hasText;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 8.0),
      color: Colors.white,
      child: SafeArea(
        child: Row(
          children: <Widget>[
            // Camera Quick Button
            IconButton(
              icon: Icon(
                Icons.camera_alt_rounded,
                size: 22,
                color: canInteract
                    ? AppColors.textSecondary
                    : Colors.grey.shade400,
              ),
              tooltip: canInteract ? 'Chụp ảnh' : 'Chưa sẵn sàng',
              onPressed: canInteract
                  ? () => _pickAndSendImage(ImageSource.camera)
                  : null,
            ),

            // Photo Library Quick Button
            IconButton(
              icon: Icon(
                Icons.photo_library_rounded,
                size: 22,
                color: canInteract
                    ? AppColors.textSecondary
                    : Colors.grey.shade400,
              ),
              tooltip: canInteract ? 'Thư viện ảnh' : 'Chưa sẵn sàng',
              onPressed: canInteract
                  ? () => _pickAndSendImage(ImageSource.gallery)
                  : null,
            ),

            // Attachment Button
            IconButton(
              icon: Icon(
                Icons.attach_file_rounded,
                size: 22,
                color: canInteract
                    ? AppColors.textSecondary
                    : Colors.grey.shade400,
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
                onSubmitted: (_) {
                  if (canSend) _handleSendMessage();
                },
                decoration: InputDecoration(
                  hintText: canInteract
                      ? 'Nhập tin nhắn...'
                      : (hasPermission
                          ? 'Đang chuẩn bị...'
                          : 'Không có quyền (403)...'),
                  hintStyle: TextStyle(
                    color: canInteract
                        ? AppColors.textMuted
                        : AppColors.error.withValues(alpha: 0.6),
                    fontSize: 13,
                  ),
                  filled: true,
                  fillColor: const Color(0xFFF3F4F6),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 4),

            // Send Button: disabled when empty or cannot interact
            IconButton(
              icon: Icon(
                Icons.send_rounded,
                color: canSend ? AppColors.primary : const Color(0xFFD1D5DB),
              ),
              onPressed: canSend ? _handleSendMessage : null,
            ),
          ],
        ),
      ),
    );
  }
}
