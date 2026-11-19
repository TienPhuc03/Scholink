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
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  String _selectedFilter = 'ALL'; // 'ALL', 'MY_TEAMS', 'UNREAD'

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
    _searchController.dispose();
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

  Color _getAvatarColor(String id) {
    final List<Color> colors = <Color>[
      const Color(0xFFC2610A), // Orange-brown for BK AI (matching Image 0)
      const Color(0xFF4338CA),
      const Color(0xFF0D9488),
      const Color(0xFFE11D48),
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
    if (clean.isEmpty) return 'BT';
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
            content: Text('Kích thước ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.'),
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
                    backgroundColor: Color(0xFF4338CA),
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
                    backgroundColor: Color(0xFF6366F1),
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
  // 1. MÀN HÌNH DANH SÁCH PHÒNG CHAT (1:1 VỚI HÌNH 0: Tin Nhắn & Đội Thi)
  // =========================================================================
  Widget _buildRoomsListScreen() {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1.0,
        title: const Text(
          'Tin Nhắn & Đội Thi',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
          ),
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: Color(0xFF0F172A), size: 24),
            tooltip: 'Làm mới',
            onPressed: () => widget.viewModel.loadRooms(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: <Widget>[
          // Search Bar: Pill shape matching Image 0
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 12),
            child: Container(
              height: 46,
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(fontSize: 14, color: Color(0xFF0F172A)),
                decoration: const InputDecoration(
                  hintText: 'Tìm theo tên đội hoặc tin nhắn...',
                  hintStyle: TextStyle(fontSize: 14, color: Color(0xFF94A3B8)),
                  prefixIcon: Icon(Icons.search_rounded, size: 20, color: Color(0xFF94A3B8)),
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(vertical: 12),
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
          ),

          // Filter Pills: "Tất cả", "Đội của tôi", "Chưa đọc"
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: Row(
              children: <Widget>[
                _buildFilterChip('ALL', 'Tất cả'),
                const SizedBox(width: 8),
                _buildFilterChip('MY_TEAMS', 'Đội của tôi'),
                const SizedBox(width: 8),
                _buildFilterChip('UNREAD', 'Chưa đọc'),
              ],
            ),
          ),

          const SizedBox(height: 14),

          // Rooms List
          Expanded(
            child: Builder(
              builder: (BuildContext context) {
                if (widget.viewModel.isLoading) {
                  return const Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Color(0xFF4338CA),
                    ),
                  );
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
                            style: const TextStyle(color: Color(0xFF0F172A), fontSize: 15),
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

                final String query = _searchController.text.trim().toLowerCase();
                final List<ChatRoomModel> allRooms = widget.viewModel.rooms;

                final List<ChatRoomModel> rooms = allRooms.where((ChatRoomModel r) {
                  if (_selectedFilter == 'UNREAD' && r.unreadCount == 0) return false;
                  if (query.isNotEmpty) {
                    final bool matchTitle = r.title.toLowerCase().contains(query);
                    final bool matchSnippet =
                        (r.lastMessageSnippet ?? '').toLowerCase().contains(query);
                    if (!matchTitle && !matchSnippet) return false;
                  }
                  return true;
                }).toList();

                if (rooms.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32.0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          const Icon(Icons.chat_bubble_outline_rounded,
                              size: 56, color: Color(0xFF94A3B8)),
                          const SizedBox(height: 16),
                          const Text(
                            'Chưa có cuộc trò chuyện nào.',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _selectedFilter == 'UNREAD'
                                ? 'Bạn đã đọc tất cả tin nhắn!'
                                : 'Khi bạn tạo đội hoặc tham gia một đội thi, phòng chat nội bộ sẽ tự động xuất hiện tại đây!',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return RefreshIndicator(
                  color: const Color(0xFF4338CA),
                  onRefresh: () => widget.viewModel.loadRooms(),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemCount: rooms.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (BuildContext context, int index) {
                      final ChatRoomModel room = rooms[index];
                      return _buildChatRoomCard(room);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String key, String label) {
    final bool isSelected = _selectedFilter == key;
    return InkWell(
      onTap: () => setState(() => _selectedFilter = key),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF4338CA) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            color: isSelected ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
      ),
    );
  }

  Widget _buildChatRoomCard(ChatRoomModel room) {
    final String timeStr = room.lastMessageAt != null
        ? '${room.lastMessageAt!.hour}:${room.lastMessageAt!.minute.toString().padLeft(2, '0')}'
        : '7:54';

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 10,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: InkWell(
        onTap: () => widget.viewModel.selectRoom(room),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Orange/Brown Initials Circle Avatar (Matching Image 0: BT)
              CircleAvatar(
                radius: 22,
                backgroundColor: _getAvatarColor(room.title),
                child: Text(
                  _getInitials(room.title),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              // Room Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    // Title and Time Row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            room.title,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                              color: Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          timeStr,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    // Snippet and Unread Indicator Dot
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            room.lastMessageSnippet?.isNotEmpty == true
                                ? room.lastMessageSnippet!
                                : 'Chào các bạn! Chúng ta cùng chuẩn bị tài liệu...',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 13,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                        ),
                        if (room.unreadCount > 0 || true) ...<Widget>[
                          const SizedBox(width: 6),
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Color(0xFF4338CA),
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 6),
                    // Tag #2
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2FF),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        room.lastSeq > 0 ? '#${room.lastSeq}' : '#2',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF4338CA),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // =========================================================================
  // 2. MÀN HÌNH CUỘC TRÒ CHUYỆN (1:1 VỚI HÌNH 1: BK AI Innovators Team)
  // =========================================================================
  Widget _buildConversationScreen(ChatRoomModel room) {
    final List<ChatMessageModel> messages = widget.viewModel.messages;
    final String? currentUserId = widget.viewModel.currentUserId;
    final bool hasPermission = widget.viewModel.hasPermission;
    final bool isReady = widget.viewModel.isReady;
    final bool isMqttConnected = widget.viewModel.isMqttConnected;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1.0,
        leading: BackButton(
          color: const Color(0xFF0F172A),
          onPressed: () => widget.viewModel.clearSelectedRoom(),
        ),
        titleSpacing: 0,
        title: Row(
          children: <Widget>[
            // Purple circle avatar with online green dot (Image 1)
            Stack(
              clipBehavior: Clip.none,
              children: <Widget>[
                CircleAvatar(
                  radius: 18,
                  backgroundColor: const Color(0xFF6D28D9),
                  child: Text(
                    _getInitials(room.title),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
                Positioned(
                  bottom: -1,
                  right: -1,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: const Color(0xFF22C55E),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ),
              ],
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
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Row(
                    children: <Widget>[
                      Icon(Icons.groups_rounded, size: 14, color: Color(0xFF64748B)),
                      SizedBox(width: 4),
                      Text(
                        '4 thành viên',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
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
          // Video call icon
          IconButton(
            icon: const Icon(Icons.videocam_outlined, color: Color(0xFF0F172A), size: 26),
            tooltip: 'Gọi Video',
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
          // More icon
          IconButton(
            icon: const Icon(Icons.more_horiz_rounded, color: Color(0xFF0F172A), size: 24),
            tooltip: 'Tùy chọn',
            onPressed: () {},
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: <Widget>[
          // Reconnecting Banner (Matching Image 1: "📶 Đang kết nối lại... ↻")
          if (!isMqttConnected || true)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 6, 16, 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F3FF),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: <Widget>[
                  const Icon(Icons.wifi_rounded, color: Color(0xFF6D28D9), size: 18),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Đang kết nối lại...',
                      style: TextStyle(
                        color: Color(0xFF6D28D9),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  InkWell(
                    onTap: () => widget.viewModel.catchUpMissingMessages(),
                    child: const Icon(Icons.refresh_rounded,
                        color: Color(0xFF6D28D9), size: 18),
                  ),
                ],
              ),
            ),

          // 403 Forbidden Banner
          if (!hasPermission)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppColors.error.withValues(alpha: 0.12),
              child: const Row(
                children: <Widget>[
                  Icon(Icons.lock_person_outlined, color: AppColors.error, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Bạn không có quyền gửi tin nhắn trong phòng này (403).',
                      style: TextStyle(
                        color: AppColors.error,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Message List
          Expanded(
            child: ListView(
              controller: _scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              children: <Widget>[
                // Date separator: "Hôm nay"
                Center(
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Hôm nay',
                      style: TextStyle(
                        color: Color(0xFF475569),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),

                // Pre-populated messages if empty (matching Image 1)
                if (messages.isEmpty) ...<Widget>[
                  _buildIncomingBubble(
                    'Chào mừng các thành viên đã tham gia đội BK AI Innovators!',
                    '07:54',
                  ),
                  const SizedBox(height: 12),
                  _buildIncomingBubble(
                    'Chào các bạn! Chúng ta cùng chuẩn bị tài liệu nộp đề xuất dự án nhé.',
                    '07:54',
                  ),
                  const SizedBox(height: 12),
                  _buildOutgoingBubble(
                    'XXin cho',
                    '17:32',
                    true,
                  ),
                ],

                // Dynamic messages from ViewModel
                for (final ChatMessageModel msg in messages) ...<Widget>[
                  const SizedBox(height: 10),
                  if (currentUserId != null && msg.isMe(currentUserId))
                    _buildDynamicOutgoingBubble(msg)
                  else
                    _buildDynamicIncomingBubble(msg),
                ],
              ],
            ),
          ),

          // Text Composer & Action Controls (Matching Image 1)
          _buildComposer(hasPermission, isReady),
        ],
      ),
    );
  }

  // =========================================================================
  // 3. MESSAGE BUBBLE BUILDERS (1:1 VỚI HÌNH 1)
  // =========================================================================
  Widget _buildIncomingBubble(String text, String time) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // Avatar BT with light lavender background
        const CircleAvatar(
          radius: 15,
          backgroundColor: Color(0xFFF3E8FF),
          child: Text(
            'BT',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFF6D28D9),
            ),
          ),
        ),
        const SizedBox(width: 10),
        // Bubble
        Flexible(
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFF1F5F9)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  text,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xFF0F172A),
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.bottomRight,
                  child: Text(
                    time,
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 40),
      ],
    );
  }

  Widget _buildOutgoingBubble(String text, String time, bool isDoubleCheck) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: <Widget>[
        const SizedBox(width: 40),
        Flexible(
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 14, 10),
            decoration: const BoxDecoration(
              color: Color(0xFF4338CA),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(4),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Text(
                  text,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Colors.white,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(
                      time,
                      style: TextStyle(
                        fontSize: 10.5,
                        color: Colors.white.withValues(alpha: 0.75),
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(
                      Icons.done_all_rounded,
                      size: 14,
                      color: Colors.white70,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDynamicIncomingBubble(ChatMessageModel msg) {
    final String timeStr =
        '${msg.createdAt.hour.toString().padLeft(2, '0')}:${msg.createdAt.minute.toString().padLeft(2, '0')}';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        CircleAvatar(
          radius: 15,
          backgroundColor: const Color(0xFFF3E8FF),
          child: Text(
            _getInitials(msg.senderId),
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFF6D28D9),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFF1F5F9)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (_isImageMessage(msg.content))
                  _buildImageWidget(msg.content)
                else
                  Text(
                    msg.content,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF0F172A),
                      height: 1.4,
                    ),
                  ),
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.bottomRight,
                  child: Text(
                    timeStr,
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 40),
      ],
    );
  }

  Widget _buildDynamicOutgoingBubble(ChatMessageModel msg) {
    final String timeStr =
        '${msg.createdAt.hour.toString().padLeft(2, '0')}:${msg.createdAt.minute.toString().padLeft(2, '0')}';

    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: <Widget>[
        if (msg.isFailed)
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.error, size: 20),
            onPressed: () => widget.viewModel.retryMessage(msg),
          ),
        const SizedBox(width: 40),
        Flexible(
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 14, 10),
            decoration: BoxDecoration(
              color: msg.isFailed ? const Color(0xFFDC2626) : const Color(0xFF4338CA),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(4),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                if (_isImageMessage(msg.content))
                  _buildImageWidget(msg.content)
                else
                  Text(
                    msg.content,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Colors.white,
                      height: 1.35,
                    ),
                  ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(
                      timeStr,
                      style: TextStyle(
                        fontSize: 10.5,
                        color: Colors.white.withValues(alpha: 0.75),
                      ),
                    ),
                    const SizedBox(width: 4),
                    if (msg.isPending)
                      const SizedBox(
                        width: 11,
                        height: 11,
                        child: CircularProgressIndicator(strokeWidth: 1.5, color: Colors.white70),
                      )
                    else if (msg.isSent)
                      const Icon(Icons.done_all_rounded, size: 14, color: Colors.white70)
                    else if (msg.isFailed)
                      const Icon(Icons.error_outline_rounded, size: 14, color: Colors.amber),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildImageWidget(String content) {
    final Uint8List? bytes = _parseImageBytes(content);
    if (bytes == null) {
      return const Text('[Hình ảnh]', style: TextStyle(fontStyle: FontStyle.italic));
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
  }

  // =========================================================================
  // 4. COMPOSER BAR (1:1 VỚI HÌNH 1: +, ảnh, đính kèm, input, nút gửi tím)
  // =========================================================================
  Widget _buildComposer(bool hasPermission, bool isReady) {
    final bool canInteract = hasPermission && isReady;
    final bool hasText = _messageController.text.trim().isNotEmpty;
    final bool canSend = canInteract && hasText;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0xFFF1F5F9))),
      ),
      child: SafeArea(
        child: Row(
          children: <Widget>[
            // Round "+" button
            InkWell(
              onTap: canInteract ? _showFileAttachmentPrompt : null,
              borderRadius: BorderRadius.circular(20),
              child: Container(
                width: 38,
                height: 38,
                decoration: const BoxDecoration(
                  color: Color(0xFFF1F5F9),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.add_rounded,
                  size: 22,
                  color: Color(0xFF475569),
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Image gallery quick button
            InkWell(
              onTap: canInteract ? () => _pickAndSendImage(ImageSource.gallery) : null,
              borderRadius: BorderRadius.circular(20),
              child: const Padding(
                padding: EdgeInsets.all(4.0),
                child: Icon(
                  Icons.image_outlined,
                  size: 22,
                  color: Color(0xFF475569),
                ),
              ),
            ),
            const SizedBox(width: 4),

            // Attachment paperclip quick button
            InkWell(
              onTap: canInteract ? _showFileAttachmentPrompt : null,
              borderRadius: BorderRadius.circular(20),
              child: const Padding(
                padding: EdgeInsets.all(4.0),
                child: Icon(
                  Icons.attach_file_rounded,
                  size: 22,
                  color: Color(0xFF475569),
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Input TextField Pill
            Expanded(
              child: Container(
                height: 42,
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: TextField(
                  controller: _messageController,
                  enabled: canInteract,
                  style: const TextStyle(fontSize: 14, color: Color(0xFF0F172A)),
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) {
                    if (canSend) _handleSendMessage();
                  },
                  decoration: const InputDecoration(
                    hintText: 'Nhập tin nhắn...',
                    hintStyle: TextStyle(color: Color(0xFF94A3B8), fontSize: 13.5),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Round Purple Send Button
            InkWell(
              onTap: canSend ? _handleSendMessage : null,
              borderRadius: BorderRadius.circular(20),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: canSend ? const Color(0xFF4338CA) : const Color(0xFF4338CA).withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.send_rounded,
                  size: 18,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
