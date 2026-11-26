import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/skeleton_loader.dart';
import '../../core/widgets/user_avatar_view.dart';
import 'team_model.dart';
import 'team_viewmodel.dart';

const List<String> kTeamAvatarPresets = <String>[
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=200&q=80',
];

const List<String> kTeamBannerPresets = <String>[
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80',
];

/// Screen for Team Listing, Searching, Filtering and Team Management (AC-02).
/// Pixel-perfect 1:1 match to Scholink Design System:
/// - AppBar: Back arrow, bold title "Scholink AI Challenge 2026", outlined "Tạo đội" button
/// - TabBar: "Tìm đội" (purple underline) vs "Đội của tôi" (clean divider underneath)
/// - Search & Filter row: Rounded search bar with hint "Tìm theo tên đội hoặc kỹ năng...", "Bộ lọc" button
/// - Count & Sort row: "X đội đang tuyển" and "Sắp xếp: Mới nhất ∨"
/// - TeamCard: APEX style with purple team avatar, team title & competition subtitle,
///   green "Đang tuyển" badge, description, metadata row (👥 1/4 thành viên | </> skills),
///   and solid purple "Xin vào đội" CTA button.
class TeamListView extends StatefulWidget {
  final TeamViewModel viewModel;
  final String competitionId;
  final String competitionTitle;

  /// F37 (APP-05): opens the team submission flow for the signed-in member's own team.
  final void Function(TeamModel team, String competitionTitle)?
      onOpenTeamSubmission;

  const TeamListView({
    super.key,
    required this.viewModel,
    this.competitionId = 'opp_scholink_ai_challenge_2026',
    this.competitionTitle = 'Scholink AI Challenge 2026',
    this.onOpenTeamSubmission,
  });

  @override
  State<TeamListView> createState() => _TeamListViewState();
}

class _TeamListViewState extends State<TeamListView> {
  final TextEditingController _searchController = TextEditingController();
  String _selectedContext = 'EXPLORE'; // 'EXPLORE' or 'MY_TEAMS'
  String _statusFilter = 'ALL'; // 'ALL', 'FORMING', 'FULL'
  String _sortOrder = 'NEWEST'; // 'NEWEST', 'SLOTS'

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.viewModel.loadTeams(widget.competitionId);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showFeedbackSnackBar({String? successMsg, String? errorMsg}) {
    if (!mounted) return;
    if (errorMsg != null && errorMsg.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: <Widget>[
              const Icon(Icons.error_outline, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(errorMsg)),
            ],
          ),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } else if (successMsg != null && successMsg.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: <Widget>[
              const Icon(Icons.check_circle_outline,
                  color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(successMsg)),
            ],
          ),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _pickImageSource({
    required BuildContext context,
    required bool isBanner,
    required void Function(String base64Uri) onPicked,
  }) async {
    final ImageSource? source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  isBanner ? 'Tải lên Ảnh bìa đội thi' : 'Tải lên Avatar đội thi',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 16),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF4338CA),
                    child: Icon(Icons.camera_alt_rounded,
                        color: Colors.white, size: 20),
                  ),
                  title: const Text('Chụp ảnh từ Máy ảnh'),
                  subtitle: const Text('Mở camera để chụp ảnh mới'),
                  onTap: () => Navigator.pop(ctx, ImageSource.camera),
                ),
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF10B981),
                    child: Icon(Icons.photo_library_rounded,
                        color: Colors.white, size: 20),
                  ),
                  title: const Text('Chọn từ Thư viện ảnh'),
                  subtitle: const Text('Tải ảnh chân dung hoặc ảnh đội từ album'),
                  onTap: () => Navigator.pop(ctx, ImageSource.gallery),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (source == null) return;

    try {
      final ImagePicker picker = ImagePicker();
      final XFile? file = await picker.pickImage(
        source: source,
        maxWidth: isBanner ? 1024 : 512,
        maxHeight: isBanner ? 768 : 512,
        imageQuality: 75,
      );
      if (file == null) return;
      final Uint8List bytes = await file.readAsBytes();
      if (bytes.isEmpty) return;
      final String b64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      onPicked(b64);
    } catch (e) {
      debugPrint('Error picking team image: $e');
    }
  }

  // =========================================================================
  // 1. DIALOG TẠO ĐỘI THI (CREATE)
  // =========================================================================
  void _showCreateTeamDialog() {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController descController = TextEditingController();
    final TextEditingController skillsController = TextEditingController();
    int minSize = 2;
    int maxSize = 4;
    String selectedAvatar = kTeamAvatarPresets[0];
    String selectedBanner = kTeamBannerPresets[0];
    String? localError;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    // Drag Handle
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: const Color(0xFFD1D5DB),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: <Widget>[
                        const Text(
                          'Tạo Đội Thi Mới',
                          style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A)),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, size: 20),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    if (localError != null)
                      Container(
                        padding: const EdgeInsets.all(10),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: AppColors.error.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          localError!,
                          style: const TextStyle(
                              color: AppColors.error, fontSize: 13),
                        ),
                      ),

                    // Live Header Preview (Banner + Avatar)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                        height: 100,
                        child: Stack(
                          children: <Widget>[
                            Positioned.fill(
                              child: AppNetworkOrBase64Image(
                                src: selectedBanner,
                                fit: BoxFit.cover,
                                placeholder: Container(
                                  color: const Color(0xFF4F46E5),
                                ),
                              ),
                            ),
                            Container(
                              color: Colors.black.withValues(alpha: 0.3),
                            ),
                            Positioned(
                              top: 8,
                              right: 8,
                              child: InkWell(
                                onTap: () => _pickImageSource(
                                  context: context,
                                  isBanner: true,
                                  onPicked: (String uri) =>
                                      setModalState(() => selectedBanner = uri),
                                ),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.6),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                        color: Colors.white.withValues(alpha: 0.4),
                                        width: 1),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: <Widget>[
                                      Icon(Icons.camera_alt_rounded,
                                          size: 13, color: Colors.white),
                                      SizedBox(width: 4),
                                      Text('Đổi ảnh bìa',
                                          style: TextStyle(
                                              color: Colors.white,
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              left: 12,
                              bottom: 12,
                              child: Row(
                                children: <Widget>[
                                  GestureDetector(
                                    onTap: () => _pickImageSource(
                                      context: context,
                                      isBanner: false,
                                      onPicked: (String uri) =>
                                          setModalState(() => selectedAvatar = uri),
                                    ),
                                    child: Stack(
                                      children: <Widget>[
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(10),
                                          child: SizedBox(
                                            width: 46,
                                            height: 46,
                                            child: AppNetworkOrBase64Image(
                                              src: selectedAvatar,
                                              fit: BoxFit.cover,
                                              placeholder: Container(
                                                  color: const Color(0xFFEEF0FD)),
                                            ),
                                          ),
                                        ),
                                        Positioned(
                                          right: 0,
                                          bottom: 0,
                                          child: Container(
                                            padding: const EdgeInsets.all(3),
                                            decoration: const BoxDecoration(
                                              color: Color(0xFF4F46E5),
                                              shape: BoxShape.circle,
                                            ),
                                            child: const Icon(
                                              Icons.camera_alt_rounded,
                                              size: 10,
                                              color: Colors.white,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    nameController.text.trim().isNotEmpty
                                        ? nameController.text.trim()
                                        : 'Tên đội của bạn',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14.5,
                                      shadows: <Shadow>[
                                        Shadow(
                                            blurRadius: 4, color: Colors.black)
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Hai nút tải ảnh lên trực tiếp từ thư viện / máy ảnh
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 9, horizontal: 8),
                              side: const BorderSide(
                                  color: Color(0xFF4F46E5), width: 1.2),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: () => _pickImageSource(
                              context: context,
                              isBanner: true,
                              onPicked: (String uri) =>
                                  setModalState(() => selectedBanner = uri),
                            ),
                            icon: const Icon(Icons.add_photo_alternate_outlined,
                                size: 17, color: Color(0xFF4F46E5)),
                            label: const Text('Tải ảnh bìa lên',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF4F46E5))),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 9, horizontal: 8),
                              side: const BorderSide(
                                  color: Color(0xFF4F46E5), width: 1.2),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: () => _pickImageSource(
                              context: context,
                              isBanner: false,
                              onPicked: (String uri) =>
                                  setModalState(() => selectedAvatar = uri),
                            ),
                            icon: const Icon(Icons.add_a_photo_outlined,
                                size: 17, color: Color(0xFF4F46E5)),
                            label: const Text('Tải avatar lên',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF4F46E5))),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Chọn ảnh bìa đội (Cover Banner)
                    const Text('Hoặc chọn từ mẫu ảnh bìa có sẵn:',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF334155))),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: 44,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: kTeamBannerPresets.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (BuildContext _, int i) {
                          final String url = kTeamBannerPresets[i];
                          final bool isSel = url == selectedBanner;
                          return GestureDetector(
                            onTap: () =>
                                setModalState(() => selectedBanner = url),
                            child: Container(
                              width: 72,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: isSel
                                      ? const Color(0xFF4F46E5)
                                      : const Color(0xFFE2E8F0),
                                  width: isSel ? 2.5 : 1,
                                ),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: AppNetworkOrBase64Image(
                                    src: url, fit: BoxFit.cover),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Chọn avatar đội
                    const Text('Hoặc chọn từ mẫu avatar có sẵn:',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF334155))),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: 44,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: kTeamAvatarPresets.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (BuildContext _, int i) {
                          final String url = kTeamAvatarPresets[i];
                          final bool isSel = url == selectedAvatar;
                          return GestureDetector(
                            onTap: () =>
                                setModalState(() => selectedAvatar = url),
                            child: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isSel
                                      ? const Color(0xFF4F46E5)
                                      : const Color(0xFFE2E8F0),
                                  width: isSel ? 2.5 : 1,
                                ),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: AppNetworkOrBase64Image(
                                    src: url, fit: BoxFit.cover),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Tên đội
                    TextField(
                      controller: nameController,
                      onChanged: (_) => setModalState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Tên đội thi (*)',
                        hintText: 'Nhập tên đội độc đáo...',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Mục tiêu & Giới thiệu
                    TextField(
                      controller: descController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Mô tả & Định hướng đề tài',
                        hintText: 'Mục tiêu giải thưởng, ý tưởng dự án...',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Kỹ năng cần tuyển
                    TextField(
                      controller: skillsController,
                      decoration: const InputDecoration(
                        labelText: 'Kỹ năng cần tuyển',
                        hintText: 'VD: OpenCV, Python, UI/UX, Backend...',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Số lượng thành viên
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            initialValue: minSize,
                            decoration: const InputDecoration(
                              labelText: 'Tối thiểu',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 10),
                            ),
                            items: const <DropdownMenuItem<int>>[
                              DropdownMenuItem<int>(value: 1, child: Text('1')),
                              DropdownMenuItem<int>(value: 2, child: Text('2')),
                              DropdownMenuItem<int>(value: 3, child: Text('3')),
                            ],
                            onChanged: (int? v) {
                              if (v != null) {
                                setModalState(() {
                                  minSize = v;
                                  if (maxSize < minSize) maxSize = minSize;
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            initialValue: maxSize,
                            decoration: const InputDecoration(
                              labelText: 'Tối đa',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 10),
                            ),
                            items: const <DropdownMenuItem<int>>[
                              DropdownMenuItem<int>(value: 2, child: Text('2')),
                              DropdownMenuItem<int>(value: 3, child: Text('3')),
                              DropdownMenuItem<int>(value: 4, child: Text('4')),
                              DropdownMenuItem<int>(value: 5, child: Text('5')),
                            ],
                            onChanged: (int? v) {
                              if (v != null) {
                                setModalState(() {
                                  maxSize = v;
                                  if (minSize > maxSize) minSize = maxSize;
                                });
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    // CTA Tạo đội
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4F46E5),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () async {
                        final String name = nameController.text.trim();
                        if (name.isEmpty) {
                          setModalState(
                              () => localError = 'Vui lòng nhập tên đội.');
                          return;
                        }
                        Navigator.pop(ctx);
                        final String desc = descController.text.trim();
                        final String skills = skillsController.text.trim();
                        final String fullDesc = skills.isNotEmpty
                            ? (desc.isNotEmpty
                                ? '$desc (Tuyển: $skills)'
                                : 'Tuyển: $skills')
                            : desc;

                        final bool ok = await widget.viewModel.createTeam(
                          competitionId: widget.competitionId,
                          name: name,
                          description: fullDesc,
                          minSize: minSize,
                          maxSize: maxSize,
                          avatarUrl: selectedAvatar,
                          bannerImageUrl: selectedBanner,
                        );
                        _showFeedbackSnackBar(
                          successMsg:
                              ok ? widget.viewModel.actionFeedback : null,
                          errorMsg: !ok ? widget.viewModel.actionError : null,
                        );
                      },
                      child: const Text('Tạo Đội Thi',
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // =========================================================================
  // 1B. DIALOG CHỈNH SỬA ĐỘI THI (UPDATE)
  // =========================================================================
  void _showEditTeamDialog(TeamModel team) {
    // Extract base description vs skills
    String baseDesc = team.description ?? '';
    String skills = '';
    if (baseDesc.contains('(Tuyển:')) {
      final List<String> parts = baseDesc.split('(Tuyển:');
      baseDesc = parts.first.trim();
      skills = parts.last.replaceAll(')', '').trim();
    } else if (baseDesc.startsWith('Tuyển:')) {
      skills = baseDesc.replaceFirst('Tuyển:', '').trim();
      baseDesc = '';
    }

    final TextEditingController nameController =
        TextEditingController(text: team.name);
    final TextEditingController descController =
        TextEditingController(text: baseDesc);
    final TextEditingController skillsController =
        TextEditingController(text: skills);
    int minSize = team.minSize.clamp(1, 4);
    int maxSize = team.maxSize.clamp(2, 5);
    String selectedAvatar = team.avatarImageUrl;
    String selectedBanner = team.bannerImageUrl;
    String? localError;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    // Drag Handle
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: const Color(0xFFD1D5DB),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: <Widget>[
                        const Text(
                          'Chỉnh Sửa Thông Tin Đội',
                          style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A)),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, size: 20),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    if (localError != null)
                      Container(
                        padding: const EdgeInsets.all(10),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: AppColors.error.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          localError!,
                          style: const TextStyle(
                              color: AppColors.error, fontSize: 13),
                        ),
                      ),

                    // Live Header Preview (Banner + Avatar)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                        height: 100,
                        child: Stack(
                          children: <Widget>[
                            Positioned.fill(
                              child: AppNetworkOrBase64Image(
                                src: selectedBanner,
                                fit: BoxFit.cover,
                                placeholder: Container(
                                  color: const Color(0xFF4F46E5),
                                ),
                              ),
                            ),
                            Container(
                              color: Colors.black.withValues(alpha: 0.3),
                            ),
                            Positioned(
                              top: 8,
                              right: 8,
                              child: InkWell(
                                onTap: () => _pickImageSource(
                                  context: context,
                                  isBanner: true,
                                  onPicked: (String uri) =>
                                      setModalState(() => selectedBanner = uri),
                                ),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.6),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                        color: Colors.white.withValues(alpha: 0.4),
                                        width: 1),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: <Widget>[
                                      Icon(Icons.camera_alt_rounded,
                                          size: 13, color: Colors.white),
                                      SizedBox(width: 4),
                                      Text('Đổi ảnh bìa',
                                          style: TextStyle(
                                              color: Colors.white,
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              left: 12,
                              bottom: 12,
                              child: Row(
                                children: <Widget>[
                                  GestureDetector(
                                    onTap: () => _pickImageSource(
                                      context: context,
                                      isBanner: false,
                                      onPicked: (String uri) =>
                                          setModalState(() => selectedAvatar = uri),
                                    ),
                                    child: Stack(
                                      children: <Widget>[
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(10),
                                          child: SizedBox(
                                            width: 46,
                                            height: 46,
                                            child: AppNetworkOrBase64Image(
                                              src: selectedAvatar,
                                              fit: BoxFit.cover,
                                              placeholder: Container(
                                                  color: const Color(0xFFEEF0FD)),
                                            ),
                                          ),
                                        ),
                                        Positioned(
                                          right: 0,
                                          bottom: 0,
                                          child: Container(
                                            padding: const EdgeInsets.all(3),
                                            decoration: const BoxDecoration(
                                              color: Color(0xFF4F46E5),
                                              shape: BoxShape.circle,
                                            ),
                                            child: const Icon(
                                              Icons.camera_alt_rounded,
                                              size: 10,
                                              color: Colors.white,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    nameController.text.trim().isNotEmpty
                                        ? nameController.text.trim()
                                        : team.name,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14.5,
                                      shadows: <Shadow>[
                                        Shadow(
                                            blurRadius: 4, color: Colors.black)
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Hai nút tải ảnh lên trực tiếp từ thư viện / máy ảnh
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 9, horizontal: 8),
                              side: const BorderSide(
                                  color: Color(0xFF4F46E5), width: 1.2),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: () => _pickImageSource(
                              context: context,
                              isBanner: true,
                              onPicked: (String uri) =>
                                  setModalState(() => selectedBanner = uri),
                            ),
                            icon: const Icon(Icons.add_photo_alternate_outlined,
                                size: 17, color: Color(0xFF4F46E5)),
                            label: const Text('Tải ảnh bìa lên',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF4F46E5))),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 9, horizontal: 8),
                              side: const BorderSide(
                                  color: Color(0xFF4F46E5), width: 1.2),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: () => _pickImageSource(
                              context: context,
                              isBanner: false,
                              onPicked: (String uri) =>
                                  setModalState(() => selectedAvatar = uri),
                            ),
                            icon: const Icon(Icons.add_a_photo_outlined,
                                size: 17, color: Color(0xFF4F46E5)),
                            label: const Text('Tải avatar lên',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF4F46E5))),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Chọn ảnh bìa
                    const Text('Hoặc chọn từ mẫu ảnh bìa có sẵn:',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF334155))),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: 44,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: kTeamBannerPresets.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (BuildContext _, int i) {
                          final String url = kTeamBannerPresets[i];
                          final bool isSel = url == selectedBanner;
                          return GestureDetector(
                            onTap: () =>
                                setModalState(() => selectedBanner = url),
                            child: Container(
                              width: 72,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: isSel
                                      ? const Color(0xFF4F46E5)
                                      : const Color(0xFFE2E8F0),
                                  width: isSel ? 2.5 : 1,
                                ),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: AppNetworkOrBase64Image(
                                    src: url, fit: BoxFit.cover),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Chọn avatar đội
                    const Text('Hoặc chọn từ mẫu avatar có sẵn:',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF334155))),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: 44,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: kTeamAvatarPresets.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (BuildContext _, int i) {
                          final String url = kTeamAvatarPresets[i];
                          final bool isSel = url == selectedAvatar;
                          return GestureDetector(
                            onTap: () =>
                                setModalState(() => selectedAvatar = url),
                            child: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: isSel
                                      ? const Color(0xFF4F46E5)
                                      : const Color(0xFFE2E8F0),
                                  width: isSel ? 2.5 : 1,
                                ),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: AppNetworkOrBase64Image(
                                    src: url, fit: BoxFit.cover),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Tên đội
                    TextField(
                      controller: nameController,
                      onChanged: (_) => setModalState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Tên đội thi (*)',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Mô tả
                    TextField(
                      controller: descController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Mô tả & Định hướng đề tài',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Kỹ năng cần tuyển
                    TextField(
                      controller: skillsController,
                      decoration: const InputDecoration(
                        labelText: 'Kỹ năng cần tuyển',
                        hintText: 'VD: OpenCV, Python, UI/UX...',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Thành viên min/max
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            initialValue: minSize,
                            decoration: const InputDecoration(
                              labelText: 'Tối thiểu',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 10),
                            ),
                            items: const <DropdownMenuItem<int>>[
                              DropdownMenuItem<int>(value: 1, child: Text('1')),
                              DropdownMenuItem<int>(value: 2, child: Text('2')),
                              DropdownMenuItem<int>(value: 3, child: Text('3')),
                            ],
                            onChanged: (int? v) {
                              if (v != null) {
                                setModalState(() {
                                  minSize = v;
                                  if (maxSize < minSize) maxSize = minSize;
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            initialValue: maxSize,
                            decoration: const InputDecoration(
                              labelText: 'Tối đa',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 10),
                            ),
                            items: const <DropdownMenuItem<int>>[
                              DropdownMenuItem<int>(value: 2, child: Text('2')),
                              DropdownMenuItem<int>(value: 3, child: Text('3')),
                              DropdownMenuItem<int>(value: 4, child: Text('4')),
                              DropdownMenuItem<int>(value: 5, child: Text('5')),
                            ],
                            onChanged: (int? v) {
                              if (v != null) {
                                setModalState(() {
                                  maxSize = v;
                                  if (minSize > maxSize) minSize = maxSize;
                                });
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    // CTA Lưu
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4F46E5),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () async {
                        final String name = nameController.text.trim();
                        if (name.isEmpty) {
                          setModalState(
                              () => localError = 'Vui lòng nhập tên đội.');
                          return;
                        }
                        Navigator.pop(ctx);
                        final String desc = descController.text.trim();
                        final String skillsText = skillsController.text.trim();
                        final String fullDesc = skillsText.isNotEmpty
                            ? (desc.isNotEmpty
                                ? '$desc (Tuyển: $skillsText)'
                                : 'Tuyển: $skillsText')
                            : desc;

                        final bool ok = await widget.viewModel.updateTeam(
                          teamId: team.id,
                          competitionId: widget.competitionId,
                          name: name,
                          description: fullDesc,
                          minSize: minSize,
                          maxSize: maxSize,
                          avatarUrl: selectedAvatar,
                          bannerImageUrl: selectedBanner,
                        );
                        _showFeedbackSnackBar(
                          successMsg:
                              ok ? widget.viewModel.actionFeedback : null,
                          errorMsg: !ok ? widget.viewModel.actionError : null,
                        );
                      },
                      child: const Text('Lưu Thay Đổi',
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // =========================================================================
  // 1C. DIALOG XÁC NHẬN GIẢI TÁN ĐỘI (DELETE)
  // =========================================================================
  void _confirmDeleteTeam(TeamModel team) {
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: <Widget>[
              Icon(Icons.warning_amber_rounded,
                  color: AppColors.error, size: 24),
              SizedBox(width: 8),
              Expanded(
                child: Text('Giải tán đội thi?',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          content: Text(
            'Bạn có chắc chắn muốn giải tán và xóa đội "${team.name}"? '
            'Tất cả thành viên và yêu cầu gia nhập liên quan sẽ bị hủy.',
            style: const TextStyle(fontSize: 13.5, color: Color(0xFF475569)),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () async {
                Navigator.pop(ctx);
                final bool ok = await widget.viewModel
                    .deleteTeam(team.id, widget.competitionId);
                _showFeedbackSnackBar(
                  successMsg: ok ? widget.viewModel.actionFeedback : null,
                  errorMsg: !ok ? widget.viewModel.actionError : null,
                );
              },
              child: const Text('Giải Tán Đội'),
            ),
          ],
        );
      },
    );
  }

  // =========================================================================
  // 1D. DIALOG XÁC NHẬN RỜI ĐỘI (LEAVE)
  // =========================================================================
  void _confirmLeaveTeam(TeamModel team) {
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('Rời đội thi?',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          content: Text(
            'Bạn có chắc chắn muốn rời khỏi đội "${team.name}"?',
            style: const TextStyle(fontSize: 13.5, color: Color(0xFF475569)),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () async {
                Navigator.pop(ctx);
                final bool ok = await widget.viewModel
                    .leaveTeam(team.id, widget.competitionId);
                _showFeedbackSnackBar(
                  successMsg: ok ? widget.viewModel.actionFeedback : null,
                  errorMsg: !ok ? widget.viewModel.actionError : null,
                );
              },
              child: const Text('Rời Đội'),
            ),
          ],
        );
      },
    );
  }

  // =========================================================================
  // 2. DIALOG GỬI YÊU CẦU GIA NHẬP (JOIN REQUEST)
  // =========================================================================
  void _showSendJoinRequestDialog(TeamModel team) {
    final TextEditingController msgController = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('Xin vào đội "${team.name}"',
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text(
                'Gửi lời nhắn giới thiệu bản thân và kinh nghiệm liên quan đến trưởng đội:',
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: msgController,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'VD: Em có kinh nghiệm OpenCV, muốn tham gia...',
                  border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.all(12),
                ),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4338CA),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () async {
                Navigator.pop(ctx);
                final bool ok = await widget.viewModel.sendJoinRequest(
                  teamId: team.id,
                  message: msgController.text.trim(),
                  competitionId: widget.competitionId,
                );
                _showFeedbackSnackBar(
                  successMsg: ok ? widget.viewModel.actionFeedback : null,
                  errorMsg: !ok ? widget.viewModel.actionError : null,
                );
              },
              child: const Text('Gửi Yêu Cầu'),
            ),
          ],
        );
      },
    );
  }

  // =========================================================================
  // 3. BOTTOM SHEET CHI TIẾT ĐỘI THI
  // =========================================================================
  void _showTeamDetailSheet(TeamModel team) {
    final String? currentUserId = widget.viewModel.currentUserId;
    final bool isLeader = currentUserId != null && team.isLeader(currentUserId);
    final bool isMember = currentUserId != null && team.isMember(currentUserId);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: const Color(0xFFD1D5DB),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Team Cover Banner + Avatar Header
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: SizedBox(
                      height: 100,
                      width: double.infinity,
                      child: Stack(
                        children: <Widget>[
                          Positioned.fill(
                            child: AppNetworkOrBase64Image(
                              src: team.bannerImageUrl,
                              fit: BoxFit.cover,
                              placeholder: Container(
                                color: const Color(0xFF4F46E5),
                              ),
                            ),
                          ),
                          Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: <Color>[
                                  Colors.black.withValues(alpha: 0.1),
                                  Colors.black.withValues(alpha: 0.55),
                                ],
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                              ),
                            ),
                          ),
                          Positioned(
                            left: 12,
                            bottom: 10,
                            child: Row(
                              children: <Widget>[
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: SizedBox(
                                    width: 44,
                                    height: 44,
                                    child: AppNetworkOrBase64Image(
                                      src: team.avatarImageUrl,
                                      fit: BoxFit.cover,
                                      placeholder: Container(
                                          color: const Color(0xFFEEF0FD)),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Text(
                                  team.name,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                    shadows: <Shadow>[
                                      Shadow(
                                          blurRadius: 4, color: Colors.black)
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          team.name,
                          style: const TextStyle(
                              fontSize: 18.5,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F172A)),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFDCFCE7),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          team.statusDisplay,
                          style: const TextStyle(
                              color: Color(0xFF16A34A),
                              fontSize: 12,
                              fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  Row(
                    children: <Widget>[
                      const Icon(Icons.people_outline_rounded,
                          size: 16, color: Color(0xFF64748B)),
                      const SizedBox(width: 6),
                      Text(
                        '${team.slotDisplay} thành viên',
                        style: const TextStyle(
                            fontSize: 13, color: Color(0xFF64748B)),
                      ),
                      const SizedBox(width: 14),
                      Text(
                        'Còn trống: ${team.remainingSlots} slot',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: team.remainingSlots > 0
                              ? const Color(0xFF4338CA)
                              : AppColors.error,
                        ),
                      ),
                    ],
                  ),

                  if (team.description != null &&
                      team.description!.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: Text(
                        team.description!,
                        style: const TextStyle(
                            fontSize: 13.5,
                            color: Color(0xFF334155),
                            height: 1.45),
                      ),
                    ),
                  ],

                  const SizedBox(height: 18),
                  const Text('Danh Sách Thành Viên',
                      style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A))),
                  const SizedBox(height: 8),

                  ...team.members.map((TeamMemberModel m) {
                    final bool memberIsLeader = m.isLeader;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFF1F5F9)),
                      ),
                      child: Row(
                        children: <Widget>[
                          m.studentId == currentUserId
                              ? UserAvatarView(
                                  size: 32,
                                  borderRadius: 16,
                                  fallbackInitials: m.fullName ?? 'S',
                                  fallbackUrl: m.avatarUrl,
                                )
                              : (m.avatarUrl != null &&
                                      m.avatarUrl!.isNotEmpty)
                                  ? ClipRRect(
                                      borderRadius:
                                          BorderRadius.circular(16),
                                      child: SizedBox(
                                        width: 32,
                                        height: 32,
                                        child: AppNetworkOrBase64Image(
                                          src: m.avatarUrl!,
                                          fit: BoxFit.cover,
                                          placeholder: CircleAvatar(
                                            radius: 16,
                                            backgroundColor:
                                                const Color(0xFFEEF0FD),
                                            child: Text(
                                              (m.fullName?.isNotEmpty == true
                                                      ? m.fullName![0]
                                                      : 'S')
                                                  .toUpperCase(),
                                              style: const TextStyle(
                                                  color: Color(0xFF4338CA),
                                                  fontSize: 12,
                                                  fontWeight:
                                                      FontWeight.bold),
                                            ),
                                          ),
                                        ),
                                      ),
                                    )
                                  : CircleAvatar(
                                      radius: 16,
                                      backgroundColor:
                                          const Color(0xFFEEF0FD),
                                      child: Text(
                                        (m.fullName?.isNotEmpty == true
                                                ? m.fullName![0]
                                                : 'S')
                                            .toUpperCase(),
                                        style: const TextStyle(
                                            color: Color(0xFF4338CA),
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold),
                                      ),
                                    ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              m.fullName ?? 'Thành viên ${m.studentId}',
                              style: const TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFF0F172A)),
                            ),
                          ),
                          if (memberIsLeader)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEEF0FD),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text('Trưởng đội',
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: Color(0xFF4338CA),
                                      fontWeight: FontWeight.w600)),
                            ),
                        ],
                      ),
                    );
                  }),

                  const SizedBox(height: 16),

                  if (isLeader) ...<Widget>[
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF4338CA),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _showLeaderReviewRequestsSheet(team);
                        },
                        icon: const Icon(Icons.manage_accounts_rounded,
                            size: 18),
                        label: const Text('Quản lý yêu cầu gia nhập'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF4338CA),
                          side: const BorderSide(color: Color(0xFF4338CA)),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _showEditTeamDialog(team);
                        },
                        icon: const Icon(Icons.edit_rounded, size: 18),
                        label: const Text('Chỉnh sửa thông tin đội'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.error,
                          side: const BorderSide(color: AppColors.error),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _confirmDeleteTeam(team);
                        },
                        icon: const Icon(Icons.delete_outline_rounded, size: 18),
                        label: const Text('Giải tán đội'),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ] else if (isMember) ...<Widget>[
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.error,
                          side: const BorderSide(color: AppColors.error),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _confirmLeaveTeam(team);
                        },
                        icon: const Icon(Icons.exit_to_app_rounded, size: 18),
                        label: const Text('Rời Đội'),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ] else if (!team.isFull) ...<Widget>[
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF4338CA),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _showSendJoinRequestDialog(team);
                        },
                        icon: const Icon(Icons.person_add_alt_1_rounded,
                            size: 18),
                        label: const Text('Xin vào đội'),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],

                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Đóng'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  // =========================================================================
  // 4. BOTTOM SHEET DUYỆT JOIN REQUEST DÀNH CHO TRƯỞNG ĐỘI
  // =========================================================================
  void _showLeaderReviewRequestsSheet(TeamModel team) {
    widget.viewModel.loadJoinRequests(team.id);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return ListenableBuilder(
          listenable: widget.viewModel,
          builder: (BuildContext context, Widget? _) {
            final List<JoinRequestModel> allRequests =
                widget.viewModel.getJoinRequestsForTeam(team.id);
            final List<JoinRequestModel> pendingRequests =
                allRequests.where((JoinRequestModel r) => r.isPending).toList();

            return SafeArea(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: const Color(0xFFD1D5DB),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Yêu Cầu Gia Nhập Đội (${pendingRequests.length})',
                      style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A)),
                    ),
                    const SizedBox(height: 14),
                    if (pendingRequests.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Center(
                          child: Text('Chưa có yêu cầu gia nhập nào.',
                              style: TextStyle(color: Color(0xFF64748B))),
                        ),
                      )
                    else
                      ...pendingRequests.map((JoinRequestModel req) {
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(req.applicant?.fullName ?? req.applicantId,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14)),
                              if (req.message != null &&
                                  req.message!.isNotEmpty) ...<Widget>[
                                const SizedBox(height: 4),
                                Text('"${req.message!}"',
                                    style: const TextStyle(
                                        fontSize: 12.5,
                                        fontStyle: FontStyle.italic,
                                        color: Color(0xFF475569))),
                              ],
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: <Widget>[
                                  OutlinedButton(
                                    onPressed: () async {
                                      await widget.viewModel.reviewJoinRequest(
                                        teamId: team.id,
                                        requestId: req.id,
                                        decision: 'REJECT',
                                        competitionId: widget.competitionId,
                                      );
                                    },
                                    child: const Text('Từ chối',
                                        style: TextStyle(fontSize: 12)),
                                  ),
                                  const SizedBox(width: 8),
                                  ElevatedButton(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF4338CA),
                                      foregroundColor: Colors.white,
                                    ),
                                    onPressed: () async {
                                      await widget.viewModel.reviewJoinRequest(
                                        teamId: team.id,
                                        requestId: req.id,
                                        decision: 'ACCEPT',
                                        competitionId: widget.competitionId,
                                      );
                                    },
                                    child: const Text('Chấp nhận',
                                        style: TextStyle(fontSize: 12)),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // =========================================================================
  // 5. BOTTOM SHEET BỘ LỌC ĐỘI THI
  // =========================================================================
  void _showFilterBottomSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return StatefulBuilder(
          builder: (BuildContext context, StateSetter setFilterState) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: const Color(0xFFD1D5DB),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      const Text(
                        'Bộ lọc đội thi',
                        style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A)),
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _statusFilter = 'ALL';
                            _searchController.clear();
                          });
                          Navigator.pop(ctx);
                        },
                        child: const Text('Đặt lại',
                            style: TextStyle(color: Color(0xFF4338CA))),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text('Trạng thái tuyển',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF334155))),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: <Widget>[
                      _buildFilterChip('Tất cả', 'ALL', setFilterState),
                      _buildFilterChip('Đang tuyển', 'FORMING', setFilterState),
                      _buildFilterChip('Đã đủ thành viên', 'FULL', setFilterState),
                    ],
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 44,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4338CA),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Áp dụng bộ lọc',
                          style: TextStyle(
                              fontSize: 14.5, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildFilterChip(
      String label, String value, StateSetter setFilterState) {
    final bool isSelected = _statusFilter == value;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      selectedColor: const Color(0xFFEEF0FD),
      backgroundColor: const Color(0xFFF1F5F9),
      labelStyle: TextStyle(
        fontSize: 13,
        color: isSelected ? const Color(0xFF4338CA) : const Color(0xFF475569),
        fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
      ),
      side: BorderSide(
        color: isSelected ? const Color(0xFF4338CA) : Colors.transparent,
      ),
      onSelected: (bool selected) {
        if (selected) {
          setFilterState(() => _statusFilter = value);
          setState(() => _statusFilter = value);
        }
      },
    );
  }

  // =========================================================================
  // 6. MAIN BUILD (PIXEL-PERFECT 1:1 TO IMAGE 0)
  // =========================================================================
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1.0,
        leading: const BackButton(color: Color(0xFF0F172A)),
        titleSpacing: 0,
        title: Text(
          widget.competitionTitle,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: Color(0xFF0F172A),
          ),
        ),
        actions: <Widget>[
          // Outlined "Tạo đội" button with purple border & icon (1:1 with Design)
          Padding(
            padding: const EdgeInsets.only(right: 16.0),
            child: BouncingWidget(
              onTap: _showCreateTeamDialog,
              scaleDown: 0.94,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF4338CA),
                  side: const BorderSide(color: Color(0xFF4338CA), width: 1.2),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  minimumSize: const Size(0, 36),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Icon(Icons.group_add_outlined,
                    size: 18, color: Color(0xFF4338CA)),
                label: const Text(
                  'Tạo đội',
                  style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF4338CA)),
                ),
                onPressed: _showCreateTeamDialog,
              ),
            ),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.viewModel,
        builder: (BuildContext context, Widget? child) {
          if (widget.viewModel.isLoading) {
            return const TeamListSkeleton(count: 4);
          }

          final String? currentUserId = widget.viewModel.currentUserId;
          final String query = _searchController.text.trim().toLowerCase();

          // Filtering
          final List<TeamModel> filteredTeams =
              widget.viewModel.teams.where((TeamModel t) {
            if (_selectedContext == 'MY_TEAMS') {
              final bool isMyTeam = currentUserId != null &&
                  (t.isMember(currentUserId) || t.isLeader(currentUserId));
              if (!isMyTeam) return false;
            }

            if (_statusFilter == 'FORMING' && t.isFull) return false;
            if (_statusFilter == 'FULL' && !t.isFull) return false;

            if (query.isNotEmpty) {
              final bool matchName = t.name.toLowerCase().contains(query);
              final bool matchDesc =
                  (t.description ?? '').toLowerCase().contains(query);
              if (!matchName && !matchDesc) return false;
            }

            return true;
          }).toList();

          return Column(
            children: <Widget>[
              // 1. Context Tabs: "Tìm đội" vs "Đội của tôi"
              _buildTopTabBar(),

              // 2. Search Box + Filter Button Row
              _buildSearchAndFilterRow(),

              // 3. Counter & Sort Row: "X đội đang tuyển" | "Sắp xếp: Mới nhất ∨"
              _buildSummaryAndSortRow(filteredTeams.length),

              // 4. Main Team List
              Expanded(
                child: filteredTeams.isEmpty
                    ? RefreshIndicator(
                        onRefresh: () =>
                            widget.viewModel.loadTeams(widget.competitionId),
                        color: const Color(0xFF4338CA),
                        child: ListView(
                          children: <Widget>[
                            Padding(
                              padding: const EdgeInsets.only(top: 60),
                              child: AppEmptyState(
                                icon: Icons.groups_outlined,
                                title: _selectedContext == 'MY_TEAMS'
                                    ? 'Bạn chưa tham gia đội thi nào'
                                    : 'Không tìm thấy đội thi phù hợp',
                                message: _selectedContext == 'MY_TEAMS'
                                    ? 'Hãy chuyển sang tab "Tìm đội" để xin vào đội, hoặc tự tạo đội mới.'
                                    : 'Hãy thử thay đổi từ khóa hoặc đặt lại bộ lọc để tìm kiếm.',
                              ),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () =>
                            widget.viewModel.loadTeams(widget.competitionId),
                        color: const Color(0xFF4338CA),
                        child: ListView.separated(
                          padding: const EdgeInsets.only(bottom: 24),
                          itemCount: filteredTeams.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 6),
                          itemBuilder: (BuildContext context, int index) {
                            final TeamModel team = filteredTeams[index];
                            return _buildApexTeamCard(team, currentUserId, index);
                          },
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  /// 1. Top Tab Bar with underline indicator
  Widget _buildTopTabBar() {
    final bool isExplore = _selectedContext == 'EXPLORE';
    final bool isMyTeams = _selectedContext == 'MY_TEAMS';

    return Container(
      color: Colors.white,
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              // Tab 1: Tìm đội
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => _selectedContext = 'EXPLORE'),
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          'Tìm đội',
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight:
                                isExplore ? FontWeight.w700 : FontWeight.w600,
                            letterSpacing: -0.2,
                            color: isExplore
                                ? const Color(0xFF4F46E5)
                                : const Color(0xFF475569),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          height: 3,
                          decoration: BoxDecoration(
                            color: isExplore
                                ? const Color(0xFF4F46E5)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              // Tab 2: Đội của tôi
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => _selectedContext = 'MY_TEAMS'),
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          'Đội của tôi',
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight:
                                isMyTeams ? FontWeight.w700 : FontWeight.w600,
                            letterSpacing: -0.2,
                            color: isMyTeams
                                ? const Color(0xFF4F46E5)
                                : const Color(0xFF475569),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          height: 3,
                          decoration: BoxDecoration(
                            color: isMyTeams
                                ? const Color(0xFF4F46E5)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          const Divider(height: 1, thickness: 1, color: Color(0xFFF1F5F9)),
        ],
      ),
    );
  }

  /// 2. Search Box + Filter Button Row (1:1 with Trang chủ)
  Widget _buildSearchAndFilterRow() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
      child: Row(
        children: <Widget>[
          // Search Field
          Expanded(
            child: Container(
              height: 36,
              decoration: BoxDecoration(
                color: const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(18),
              ),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(fontSize: 12, color: Color(0xFF0F172A)),
                decoration: const InputDecoration(
                  hintText: 'Tìm theo tên đội hoặc kỹ năng...',
                  hintStyle:
                      TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                  prefixIcon: Icon(Icons.search_rounded,
                      size: 16, color: Color(0xFF6B7280)),
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(vertical: 7),
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Filter Button
          InkWell(
            onTap: _showFilterBottomSheet,
            borderRadius: BorderRadius.circular(18),
            child: Container(
              height: 36,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFEEF2FF),
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(Icons.tune_rounded,
                      size: 14, color: Color(0xFF4F46E5)),
                  SizedBox(width: 4),
                  Text(
                    'Bộ lọc',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF4F46E5),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 3. Summary & Sort Row: "3 đội đang tuyển" | "Sắp xếp: Mới nhất ∨"
  Widget _buildSummaryAndSortRow(int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          Text(
            '$count đội đang tuyển',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF334155),
            ),
          ),
          InkWell(
            onTap: () {
              setState(() {
                _sortOrder = _sortOrder == 'NEWEST' ? 'SLOTS' : 'NEWEST';
              });
            },
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  _sortOrder == 'NEWEST'
                      ? 'Sắp xếp: Mới nhất'
                      : 'Sắp xếp: Chỗ trống',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF475569),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 2),
                const Icon(Icons.keyboard_arrow_down_rounded,
                    size: 16, color: Color(0xFF475569)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 4. APEX Team Card (1:1 with Design Image 0)
  Widget _buildApexTeamCard(TeamModel team, String? currentUserId, int index) {
    final bool isLeader = currentUserId != null && team.isLeader(currentUserId);
    final bool isMember = currentUserId != null && team.isMember(currentUserId);
    final JoinRequestModel? myRequest =
        widget.viewModel.getMyRequestForTeam(team.id);

    // Extract skills from description or provide default tags
    String skillsDisplay = 'OpenCV • Thị giác máy tính';
    if (team.description != null && team.description!.contains('Tuyển:')) {
      final String extracted = team.description!.split('Tuyển:').last;
      skillsDisplay = extracted.replaceAll(')', '').trim();
    }

    return FadeSlideTransition(
      delay: Duration(milliseconds: (index * 40).clamp(0, 240)),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFF1F5F9), width: 1.2),
          boxShadow: const <BoxShadow>[
            BoxShadow(
              color: Color(0x06000000),
              blurRadius: 10,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: InkWell(
          onTap: () => _showTeamDetailSheet(team),
          borderRadius: BorderRadius.circular(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Header Row: Avatar + Team Name + Competition Name + Badge
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  // Team Squircle Avatar
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: AppNetworkOrBase64Image(
                        src: team.avatarImageUrl,
                        fit: BoxFit.cover,
                        placeholder: Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFFEEF0FD),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.groups_rounded,
                            color: Color(0xFF4F46E5),
                            size: 24,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Team Title & Competition Subtitle
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            Flexible(
                              child: Text(
                                team.name,
                                style: const TextStyle(
                                  fontSize: 15.5,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.3,
                                  color: Color(0xFF0F172A),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.verified_rounded,
                              size: 14,
                              color: Color(0xFF4F46E5),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.competitionTitle,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Badge: "Đang tuyển" (with subtle breathing pulse when forming)
                  team.isFull
                      ? Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEE2E2),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Đã đủ',
                            style: TextStyle(
                              color: Color(0xFFDC2626),
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        )
                      : PulsingWidget(
                          minScale: 0.95,
                          maxScale: 1.05,
                          duration: const Duration(milliseconds: 1800),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFDCFCE7),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              team.statusDisplay,
                              style: const TextStyle(
                                color: Color(0xFF16A34A),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                  const SizedBox(width: 4),
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.more_vert_rounded,
                        size: 20, color: Color(0xFF94A3B8)),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onSelected: (String action) {
                      switch (action) {
                        case 'EDIT':
                          _showEditTeamDialog(team);
                          break;
                        case 'MANAGE':
                          _showLeaderReviewRequestsSheet(team);
                          break;
                        case 'DELETE':
                          _confirmDeleteTeam(team);
                          break;
                        case 'LEAVE':
                          _confirmLeaveTeam(team);
                          break;
                        case 'DETAIL':
                          _showTeamDetailSheet(team);
                          break;
                        case 'JOIN':
                          _showSendJoinRequestDialog(team);
                          break;
                      }
                    },
                    itemBuilder: (BuildContext context) =>
                        <PopupMenuEntry<String>>[
                      if (isLeader) ...<PopupMenuEntry<String>>[
                        const PopupMenuItem<String>(
                          value: 'EDIT',
                          child: Row(
                            children: <Widget>[
                              Icon(Icons.edit_outlined,
                                  size: 18, color: Color(0xFF4F46E5)),
                              SizedBox(width: 8),
                              Text('Chỉnh sửa đội',
                                  style: TextStyle(fontSize: 13)),
                            ],
                          ),
                        ),
                        const PopupMenuItem<String>(
                          value: 'MANAGE',
                          child: Row(
                            children: <Widget>[
                              Icon(Icons.manage_accounts_outlined,
                                  size: 18, color: Color(0xFF4F46E5)),
                              SizedBox(width: 8),
                              Text('Duyệt thành viên',
                                  style: TextStyle(fontSize: 13)),
                            ],
                          ),
                        ),
                        const PopupMenuDivider(),
                        const PopupMenuItem<String>(
                          value: 'DELETE',
                          child: Row(
                            children: <Widget>[
                              Icon(Icons.delete_outline_rounded,
                                  size: 18, color: AppColors.error),
                              SizedBox(width: 8),
                              Text('Giải tán đội',
                                  style: TextStyle(
                                      fontSize: 13, color: AppColors.error)),
                            ],
                          ),
                        ),
                      ] else if (isMember) ...<PopupMenuEntry<String>>[
                        const PopupMenuItem<String>(
                          value: 'DETAIL',
                          child: Row(
                            children: <Widget>[
                              Icon(Icons.info_outline_rounded,
                                  size: 18, color: Color(0xFF4F46E5)),
                              SizedBox(width: 8),
                              Text('Xem chi tiết',
                                  style: TextStyle(fontSize: 13)),
                            ],
                          ),
                        ),
                        const PopupMenuDivider(),
                        const PopupMenuItem<String>(
                          value: 'LEAVE',
                          child: Row(
                            children: <Widget>[
                              Icon(Icons.exit_to_app_rounded,
                                  size: 18, color: AppColors.error),
                              SizedBox(width: 8),
                              Text('Rời đội',
                                  style: TextStyle(
                                      fontSize: 13, color: AppColors.error)),
                            ],
                          ),
                        ),
                      ] else ...<PopupMenuEntry<String>>[
                        const PopupMenuItem<String>(
                          value: 'DETAIL',
                          child: Row(
                            children: <Widget>[
                              Icon(Icons.info_outline_rounded,
                                  size: 18, color: Color(0xFF4F46E5)),
                              SizedBox(width: 8),
                              Text('Xem chi tiết',
                                  style: TextStyle(fontSize: 13)),
                            ],
                          ),
                        ),
                        if (!team.isFull)
                          const PopupMenuItem<String>(
                            value: 'JOIN',
                            child: Row(
                              children: <Widget>[
                                Icon(Icons.person_add_alt_1_outlined,
                                    size: 18, color: Color(0xFF16A34A)),
                                SizedBox(width: 8),
                                Text('Xin vào đội',
                                    style: TextStyle(fontSize: 13)),
                              ],
                            ),
                          ),
                      ],
                    ],
                  ),
                ],
              ),

            // Description
            const SizedBox(height: 10),
            Text(
              team.description?.isNotEmpty == true
                  ? team.description!
                  : 'Tìm đồng đội có kinh nghiệm OpenCV, cùng giải quyết bài toán nhận diện hình ảnh.',
              style: const TextStyle(
                fontSize: 12.5,
                color: Color(0xFF475569),
                height: 1.4,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),

            // Visual Team Cover Banner (Matching OpportunityCard style)
            Padding(
              padding: const EdgeInsets.only(top: 8.0),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 130),
                  child: Stack(
                    children: <Widget>[
                      AspectRatio(
                        aspectRatio: 16 / 9,
                        child: AppNetworkOrBase64Image(
                          src: team.bannerImageUrl,
                          fit: BoxFit.cover,
                          placeholder: Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                colors: <Color>[
                                  Color(0xFF4F46E5),
                                  Color(0xFF7C3AED),
                                ],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                            ),
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.groups_rounded,
                              size: 36,
                              color: Colors.white70,
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        bottom: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3.5),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.65),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '#${team.name.replaceAll(' ', '')}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Metadata Row: 👥 1/4 thành viên | </> OpenCV • Thị giác máy tính
            const SizedBox(height: 12),
            Row(
              children: <Widget>[
                const Icon(Icons.people_outline_rounded,
                    size: 15, color: Color(0xFF475569)),
                const SizedBox(width: 5),
                Text(
                  '${team.slotDisplay} thành viên',
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: Color(0xFF475569),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Text('|',
                      style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 11.5)),
                ),
                const Icon(Icons.code_rounded,
                    size: 15, color: Color(0xFF475569)),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    skillsDisplay,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: Color(0xFF475569),
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),

            // Bottom CTA Button (Right aligned)
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: _buildCardActionButton(team, isLeader, isMember, myRequest),
            ),
          ],
        ),
      ),
    ),
    );
  }

  Widget _buildCardActionButton(TeamModel team, bool isLeader, bool isMember,
      JoinRequestModel? myRequest) {
    if (isLeader) {
      return BouncingWidget(
        onTap: () => _showLeaderReviewRequestsSheet(team),
        scaleDown: 0.94,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF4F46E5),
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () => _showLeaderReviewRequestsSheet(team),
          child: const Text('Quản lý đội',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      );
    }

    if (isMember) {
      return BouncingWidget(
        onTap: () => _showTeamDetailSheet(team),
        scaleDown: 0.94,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFF4F46E5),
            side: const BorderSide(color: Color(0xFF4F46E5), width: 1.2),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () => _showTeamDetailSheet(team),
          child: const Text('Đã tham gia',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      );
    }

    if (myRequest != null && myRequest.isPending) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFFFEF3C7),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text('Đã gửi yêu cầu',
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFFB45309))),
      );
    }

    return BouncingWidget(
      onTap: team.isFull ? null : () => _showSendJoinRequestDialog(team),
      scaleDown: 0.94,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4F46E5),
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
        onPressed: team.isFull ? null : () => _showSendJoinRequestDialog(team),
        child: Text(
          team.isFull ? 'Hết chỗ' : 'Xin vào đội',
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
