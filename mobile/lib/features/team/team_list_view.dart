import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/app_widgets.dart';
import '../passport/passport_model.dart';
import '../passport/passport_repository.dart';
import '../passport/profile_view_screen.dart';
import 'team_model.dart';
import 'team_viewmodel.dart';

/// Screen for Team Listing, Searching, Filtering and Team Management (AC-02).
/// Follows Scholink Design System:
/// - Context separation: "Khám phá đội" vs "Đội của tôi"
/// - Search & status filters (Đang tuyển, Đã đầy slot)
/// - Unified TeamCard hierarchy and role-based CTA
/// - Non-intrusive "Tạo đội" AppBar action
/// - Clean structured Team Detail sheet with safe area & drag handle
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

  // =========================================================================
  // 1. DIALOG TẠO ĐỘI THI
  // =========================================================================
  void _showCreateTeamDialog() {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController descController = TextEditingController();
    final TextEditingController skillsController = TextEditingController();
    int minSize = 2;
    int maxSize = 4;
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
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, size: 20),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    if (localError != null) ...<Widget>[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: AppColors.error.withValues(alpha: 0.2)),
                        ),
                        child: Text(
                          localError!,
                          style: const TextStyle(
                              color: AppColors.error, fontSize: 13),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Tên đội thi *',
                        hintText: 'Ví dụ: AI Vision Pioneers',
                        prefixIcon: Icon(Icons.group_work_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: skillsController,
                      decoration: const InputDecoration(
                        labelText: 'Vị trí & Kỹ năng cần tuyển',
                        hintText: 'Ví dụ: PyTorch, OpenCV, Frontend Flutter...',
                        prefixIcon: Icon(Icons.psychology_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: descController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Mô tả mục tiêu đội thi',
                        hintText: 'Mục tiêu giải quyết đề tài, lịch họp...',
                        prefixIcon: Icon(Icons.description_outlined),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              const Text('Tối thiểu (Min)',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: AppColors.textSecondary)),
                              const SizedBox(height: 4),
                              DropdownButtonFormField<int>(
                                initialValue: minSize,
                                decoration: const InputDecoration(
                                  contentPadding: EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 8),
                                ),
                                items: <int>[2, 3, 4].map((int val) {
                                  return DropdownMenuItem<int>(
                                      value: val, child: Text('$val bạn'));
                                }).toList(),
                                onChanged: (int? v) {
                                  if (v != null) {
                                    setModalState(() {
                                      minSize = v;
                                      if (maxSize < minSize) maxSize = minSize;
                                    });
                                  }
                                },
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              const Text('Tối đa (Max)',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: AppColors.textSecondary)),
                              const SizedBox(height: 4),
                              DropdownButtonFormField<int>(
                                initialValue: maxSize,
                                decoration: const InputDecoration(
                                  contentPadding: EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 8),
                                ),
                                items: <int>[2, 3, 4, 5, 6].map((int val) {
                                  return DropdownMenuItem<int>(
                                      value: val, child: Text('$val bạn'));
                                }).toList(),
                                onChanged: (int? v) {
                                  if (v != null) {
                                    setModalState(() {
                                      maxSize = v;
                                      if (minSize > maxSize) minSize = maxSize;
                                    });
                                  }
                                },
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () async {
                        final String name = nameController.text.trim();
                        if (name.isEmpty) {
                          setModalState(
                              () => localError = 'Vui lòng nhập tên đội thi.');
                          return;
                        }

                        final String skills = skillsController.text.trim();
                        final String desc = descController.text.trim();
                        final String fullDesc = <String>[
                          if (skills.isNotEmpty) 'Vị trí cần: $skills',
                          if (desc.isNotEmpty) desc,
                        ].join(' | ');

                        final bool ok = await widget.viewModel.createTeam(
                          competitionId: widget.competitionId,
                          name: name,
                          description: fullDesc.isEmpty ? null : fullDesc,
                          minSize: minSize,
                          maxSize: maxSize,
                        );

                        if (ok) {
                          if (ctx.mounted) Navigator.pop(ctx);
                          _showFeedbackSnackBar(
                              successMsg: widget.viewModel.actionFeedback);
                        } else {
                          setModalState(() {
                            localError = widget.viewModel.actionError ??
                                'Không thể tạo đội thi.';
                          });
                        }
                      },
                      child: const Text('Xác nhận Tạo Đội Thi',
                          style: TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 14.5)),
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
  // 2. DIALOG XIN VÀO ĐỘI
  // =========================================================================
  void _showSendJoinRequestDialog(TeamModel team) {
    final TextEditingController msgController = TextEditingController(
      text: 'Chào bạn, mình muốn xin tham gia đội để cùng làm đề tài.',
    );

    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('Xin vào đội: ${team.name}',
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Slot hiện tại: ${team.slotDisplay} (Còn trống: ${team.remainingSlots} chỗ)',
                style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: msgController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Lời nhắn gửi Trưởng đội *',
                  hintText: 'Giới thiệu kỹ năng, kinh nghiệm của bạn...',
                ),
              ),
            ],
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy',
                  style: TextStyle(color: AppColors.textSecondary)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () async {
                Navigator.pop(ctx);
                final bool ok = await widget.viewModel.sendJoinRequest(
                  teamId: team.id,
                  competitionId: widget.competitionId,
                  message: msgController.text.trim(),
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
  // 3. BOTTOM SHEET CHI TIẾT ĐỘI THI (Phân khối rõ ràng theo Section 4.2)
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
                  // Drag handle
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

                  // Khối 1: Thông tin đội & Trạng thái tuyển
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          team.name,
                          style: const TextStyle(
                              fontSize: 18.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary),
                        ),
                      ),
                      StatusBadge(
                        label: 'Slots: ${team.slotDisplay}',
                        backgroundColor: team.isFull
                            ? AppColors.error.withValues(alpha: 0.1)
                            : AppColors.success.withValues(alpha: 0.1),
                        textColor:
                            team.isFull ? AppColors.error : AppColors.success,
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: <Widget>[
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: team.isActive
                              ? AppColors.success
                              : AppColors.warning,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        team.statusDisplay,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          color: team.isActive
                              ? AppColors.success
                              : AppColors.warning,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Còn trống: ${team.remainingSlots} slot',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: team.remainingSlots > 0
                              ? AppColors.primary
                              : AppColors.error,
                        ),
                      ),
                    ],
                  ),

                  // Khối 2: Vị trí cần tuyển & Mô tả
                  if (team.description != null &&
                      team.description!.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF9FAFB),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFE5E7EB)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          const Text(
                            'Vị trí & Mục tiêu:',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            team.description!,
                            style: const TextStyle(
                                fontSize: 13.5,
                                color: AppColors.textPrimary,
                                height: 1.35),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 16),
                  const Divider(height: 1, color: Color(0xFFE5E7EB)),
                  const SizedBox(height: 14),

                  // Khối 3: Danh sách thành viên
                  Text(
                    'Thành viên (${team.memberCount}/${team.maxSize}):',
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary),
                  ),
                  const SizedBox(height: 10),
                  ...team.members.map((TeamMemberModel member) {
                    final bool memberIsLeader =
                        member.isLeader || member.studentId == team.leaderId;
                    final String displayName =
                        (member.fullName != null && member.fullName!.isNotEmpty)
                            ? member.fullName!
                            : member.studentId;
                    final String initial = displayName.isNotEmpty
                        ? displayName.substring(0, 1).toUpperCase()
                        : 'U';

                    return GestureDetector(
                      onTap: () {
                        final PassportRepository repo =
                            GetIt.I<PassportRepository>();
                        Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) => ProfileViewScreen(
                              title: 'Hồ sơ thành viên: $displayName',
                              viewModel: ProfileViewViewModel(
                                (_) => repo.getTeammateProfile(
                                    teamId: team.id,
                                    studentId: member.studentId),
                                audiences: const <ProfileAudience>[
                                  ProfileAudience.teammates
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: memberIsLeader
                              ? const Color(0xFFEEF0FD)
                              : const Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: memberIsLeader
                                ? AppColors.primary.withValues(alpha: 0.25)
                                : const Color(0xFFE5E7EB),
                          ),
                        ),
                        child: Row(
                          children: <Widget>[
                            CircleAvatar(
                              radius: 17,
                              backgroundColor: memberIsLeader
                                  ? AppColors.primary
                                  : const Color(0xFF9CA3AF),
                              backgroundImage: (member.avatarUrl != null &&
                                      member.avatarUrl!.isNotEmpty)
                                  ? NetworkImage(member.avatarUrl!)
                                  : null,
                              child: (member.avatarUrl == null ||
                                      member.avatarUrl!.isEmpty)
                                  ? Text(
                                      initial,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w600,
                                          fontSize: 13),
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(
                                    displayName,
                                    style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.textPrimary),
                                  ),
                                  if (member.fullName != null &&
                                      member.fullName!.isNotEmpty)
                                    Text(
                                      member.studentId,
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.textSecondary),
                                    ),
                                  const SizedBox(height: 2),
                                  StatusBadge(
                                    label: memberIsLeader
                                        ? 'Trưởng đội'
                                        : 'Thành viên',
                                    fontSize: 10.5,
                                    backgroundColor: memberIsLeader
                                        ? AppColors.primary
                                            .withValues(alpha: 0.12)
                                        : const Color(0xFFE5E7EB),
                                    textColor: memberIsLeader
                                        ? AppColors.primary
                                        : const Color(0xFF4B5563),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right_rounded,
                                size: 18, color: AppColors.textMuted),
                          ],
                        ),
                      ),
                    );
                  }),

                  const SizedBox(height: 16),

                  // Khối 4: Hành động theo role
                  if (isLeader) ...<Widget>[
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () {
                          Navigator.pop(ctx);
                          _showLeaderReviewRequestsSheet(team);
                        },
                        icon: const Icon(Icons.people_outline, size: 18),
                        label: const Text('Quản lý yêu cầu xin vào đội'),
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
                          _showDeleteTeamConfirmationDialog(team);
                        },
                        icon:
                            const Icon(Icons.delete_outline_rounded, size: 18),
                        label: const Text('Giải tán và Xóa đội thi'),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ] else if (isMember) ...<Widget>[
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.error,
                          side: const BorderSide(color: AppColors.error),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () async {
                          Navigator.pop(ctx);
                          final bool ok = await widget.viewModel
                              .leaveTeam(team.id, widget.competitionId);
                          _showFeedbackSnackBar(
                            successMsg:
                                ok ? widget.viewModel.actionFeedback : null,
                            errorMsg: !ok ? widget.viewModel.actionError : null,
                          );
                        },
                        child: const Text('Rời Đội'),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ] else if (!team.isFull) ...<Widget>[
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
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
  // 3b. HỘP THOẠI XÁC NHẬN XÓA / GIẢI TÁN ĐỘI THI (DÀNH CHO TRƯỞNG ĐỘI)
  // =========================================================================
  void _showDeleteTeamConfirmationDialog(TeamModel team) {
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
                child: Text(
                  'Giải tán đội thi?',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          content: Text(
            'Bạn có chắc chắn muốn giải tán và xóa đội "${team.name}" không? Toàn bộ thành viên sẽ được giải phóng và các yêu cầu gia nhập liên quan sẽ bị hủy. Thao tác này không thể hoàn tác.',
            style: const TextStyle(
                fontSize: 13.5, color: AppColors.textSecondary, height: 1.4),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy',
                  style: TextStyle(color: AppColors.textSecondary)),
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
              child: const Text('Xác nhận xóa'),
            ),
          ],
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
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: <Widget>[
                        Text(
                          'Yêu cầu xin vào: ${team.name}',
                          style: const TextStyle(
                              fontSize: 16.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary),
                        ),
                        IconButton(
                          icon: const Icon(Icons.refresh_rounded, size: 20),
                          onPressed: () =>
                              widget.viewModel.loadJoinRequests(team.id),
                        ),
                      ],
                    ),
                    Text(
                      'Hiện có ${pendingRequests.length} yêu cầu đang chờ duyệt (Slot: ${team.slotDisplay})',
                      style: const TextStyle(
                          fontSize: 12.5, color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 14),
                    if (pendingRequests.isEmpty) ...<Widget>[
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 36),
                        child: Center(
                          child: Text(
                            'Không có yêu cầu nào đang chờ duyệt.',
                            style: TextStyle(
                                color: AppColors.textSecondary, fontSize: 13.5),
                          ),
                        ),
                      ),
                    ] else ...<Widget>[
                      ...pendingRequests.map((JoinRequestModel req) {
                        final bool isProcessing =
                            widget.viewModel.isRequestProcessing(req.id);
                        final String displayName =
                            (req.applicant?.fullName.isNotEmpty == true)
                                ? req.applicant!.fullName
                                : req.applicantId;
                        final String initial = displayName.isNotEmpty
                            ? displayName.substring(0, 1).toUpperCase()
                            : 'U';
                        final String eduSummary =
                            req.applicant?.educationDisplay ?? '';

                        void openProfile() {
                          final PassportRepository repo =
                              GetIt.I<PassportRepository>();
                          Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) => ProfileViewScreen(
                                title: 'Hồ sơ ứng viên: $displayName',
                                viewModel: ProfileViewViewModel(
                                  (_) => repo.getTeammateProfile(
                                      teamId: team.id,
                                      studentId: req.applicantId),
                                  audiences: const <ProfileAudience>[
                                    ProfileAudience.teammates
                                  ],
                                ),
                              ),
                            ),
                          );
                        }

                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12.0),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFE5E7EB)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              InkWell(
                                onTap: openProfile,
                                borderRadius: BorderRadius.circular(8),
                                child: Row(
                                  children: <Widget>[
                                    CircleAvatar(
                                      radius: 18,
                                      backgroundColor: AppColors.primary
                                          .withValues(alpha: 0.15),
                                      backgroundImage: (req.applicant?.avatarUrl
                                                  .isNotEmpty ==
                                              true)
                                          ? NetworkImage(
                                              req.applicant!.avatarUrl)
                                          : null,
                                      child: (req.applicant?.avatarUrl
                                                  .isEmpty ??
                                              true)
                                          ? Text(
                                              initial,
                                              style: const TextStyle(
                                                  color: AppColors.primary,
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 13.5),
                                            )
                                          : null,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: <Widget>[
                                          Text(
                                            displayName,
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w600,
                                                fontSize: 14,
                                                color: AppColors.textPrimary),
                                          ),
                                          if (req.applicant?.fullName
                                                  .isNotEmpty ==
                                              true)
                                            Text(
                                              req.applicantId,
                                              style: const TextStyle(
                                                  fontSize: 11,
                                                  color:
                                                      AppColors.textSecondary),
                                            ),
                                          if (eduSummary
                                              .isNotEmpty) ...<Widget>[
                                            const SizedBox(height: 2),
                                            Text(
                                              eduSummary,
                                              style: const TextStyle(
                                                  fontSize: 11.5,
                                                  color: AppColors.primary,
                                                  fontWeight: FontWeight.w500),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    Text(
                                      '${req.appliedAt.hour}:${req.appliedAt.minute.toString().padLeft(2, '0')}',
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.textMuted),
                                    ),
                                  ],
                                ),
                              ),
                              if (req.message != null &&
                                  req.message!.isNotEmpty) ...<Widget>[
                                const SizedBox(height: 8),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF9FAFB),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '"${req.message}"',
                                    style: const TextStyle(
                                        fontSize: 12.5,
                                        fontStyle: FontStyle.italic,
                                        color: AppColors.textSecondary),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 10),
                              Row(
                                children: <Widget>[
                                  TextButton.icon(
                                    style: TextButton.styleFrom(
                                      foregroundColor: AppColors.primary,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 4),
                                    ),
                                    icon: const Icon(Icons.badge_outlined,
                                        size: 16),
                                    label: const Text('Xem CV / Hồ sơ',
                                        style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600)),
                                    onPressed: openProfile,
                                  ),
                                  const Spacer(),
                                  OutlinedButton.icon(
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: AppColors.error,
                                      side: const BorderSide(
                                          color: AppColors.error),
                                      minimumSize: const Size(70, 32),
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 8),
                                    ),
                                    onPressed: isProcessing
                                        ? null
                                        : () async {
                                            final bool ok = await widget
                                                .viewModel
                                                .reviewJoinRequest(
                                              teamId: team.id,
                                              requestId: req.id,
                                              decision: 'REJECT',
                                              competitionId:
                                                  widget.competitionId,
                                            );
                                            _showFeedbackSnackBar(
                                              successMsg: ok
                                                  ? widget
                                                      .viewModel.actionFeedback
                                                  : null,
                                              errorMsg: !ok
                                                  ? widget.viewModel.actionError
                                                  : null,
                                            );
                                          },
                                    icon: const Icon(Icons.close, size: 14),
                                    label: const Text('Từ chối',
                                        style: TextStyle(fontSize: 11.5)),
                                  ),
                                  const SizedBox(width: 8),
                                  ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.success,
                                      foregroundColor: Colors.white,
                                      minimumSize: const Size(96, 32),
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 10),
                                    ),
                                    onPressed: isProcessing
                                        ? null
                                        : () async {
                                            final bool ok = await widget
                                                .viewModel
                                                .reviewJoinRequest(
                                              teamId: team.id,
                                              requestId: req.id,
                                              decision: 'ACCEPT',
                                              competitionId:
                                                  widget.competitionId,
                                            );
                                            _showFeedbackSnackBar(
                                              successMsg: ok
                                                  ? widget
                                                      .viewModel.actionFeedback
                                                  : null,
                                              errorMsg: !ok
                                                  ? widget.viewModel.actionError
                                                  : null,
                                            );
                                          },
                                    icon: isProcessing
                                        ? const SizedBox(
                                            width: 12,
                                            height: 12,
                                            child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                                color: Colors.white),
                                          )
                                        : const Icon(Icons.check, size: 14),
                                    label: Text(
                                      isProcessing
                                          ? 'Đang duyệt...'
                                          : 'Duyệt vào',
                                      style: const TextStyle(fontSize: 11.5),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
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
  // 5. MAIN BUILD & FILTERING
  // =========================================================================
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(widget.competitionTitle,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 1.0,
        actions: <Widget>[
          // Thu nhỏ Tạo đội thành Action trên AppBar (Không che chắn Bottom Navigation hay list)
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: AppColors.primary),
            icon: const Icon(Icons.group_add_rounded, size: 18),
            label: const Text('Tạo Đội',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            onPressed: _showCreateTeamDialog,
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 20),
            tooltip: 'Làm mới',
            onPressed: () => widget.viewModel.loadTeams(widget.competitionId),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.viewModel,
        builder: (BuildContext context, Widget? child) {
          if (widget.viewModel.isLoading) {
            return const Center(
                child: CircularProgressIndicator(strokeWidth: 2.5));
          }

          if (widget.viewModel.hasError) {
            return AppEmptyState(
              icon: Icons.error_outline_rounded,
              iconColor: AppColors.error,
              title: 'Không thể tải danh sách đội',
              message: widget.viewModel.errorMessage ??
                  'Kiểm tra kết nối mạng rồi thử lại.',
              action: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white),
                onPressed: () =>
                    widget.viewModel.loadTeams(widget.competitionId),
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Thử lại'),
              ),
            );
          }

          final String? currentUserId = widget.viewModel.currentUserId;
          final String query = _searchController.text.trim().toLowerCase();

          // Lọc theo ngữ cảnh và trạng thái
          final List<TeamModel> filteredTeams =
              widget.viewModel.teams.where((TeamModel t) {
            // Context filter: Khám phá vs Đội của tôi
            if (_selectedContext == 'MY_TEAMS') {
              final bool isMyTeam = currentUserId != null &&
                  (t.isMember(currentUserId) || t.isLeader(currentUserId));
              if (!isMyTeam) return false;
            }

            // Status filter
            if (_statusFilter == 'FORMING' && t.isFull) return false;
            if (_statusFilter == 'FULL' && !t.isFull) return false;

            // Search filter
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
              // Header Controls Container: Search + Context Tabs + Status Chips
              Container(
                color: Colors.white,
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
                child: Column(
                  children: <Widget>[
                    // Search Bar
                    Container(
                      height: 38,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEDF3F8),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: TextField(
                        controller: _searchController,
                        style: const TextStyle(
                            fontSize: 13.5, color: AppColors.textPrimary),
                        decoration: InputDecoration(
                          hintText:
                              'Tìm theo tên đội hoặc kỹ năng cần tuyển...',
                          hintStyle: const TextStyle(
                              fontSize: 13, color: AppColors.textSecondary),
                          prefixIcon: const Icon(Icons.search_rounded,
                              size: 18, color: AppColors.textSecondary),
                          suffixIcon: _searchController.text.isNotEmpty
                              ? IconButton(
                                  padding: EdgeInsets.zero,
                                  icon:
                                      const Icon(Icons.clear_rounded, size: 16),
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() {});
                                  },
                                )
                              : null,
                          border: InputBorder.none,
                          filled: false,
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 9),
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Context Tab Selector: «Khám phá đội» vs «Đội của tôi»
                    Row(
                      children: <Widget>[
                        _buildContextTab('EXPLORE', 'Khám phá đội',
                            _selectedContext == 'EXPLORE'),
                        const SizedBox(width: 8),
                        _buildContextTab('MY_TEAMS', 'Đội của tôi',
                            _selectedContext == 'MY_TEAMS'),
                        const Spacer(),
                        // Status Filter Chips: Tất cả / Đang tuyển / Đầy slot
                        _buildStatusChip('ALL', 'Tất cả'),
                        const SizedBox(width: 4),
                        _buildStatusChip('FORMING', 'Đang tuyển'),
                        const SizedBox(width: 4),
                        _buildStatusChip('FULL', 'Đã đủ slot'),
                      ],
                    ),
                  ],
                ),
              ),

              const Divider(height: 1, color: Color(0xFFE5E7EB)),

              // Main Team List
              Expanded(
                child: filteredTeams.isEmpty
                    ? RefreshIndicator(
                        onRefresh: () =>
                            widget.viewModel.loadTeams(widget.competitionId),
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
                                    ? 'Hãy chuyển sang tab "Khám phá đội" để xin vào đội, hoặc tự tạo đội mới.'
                                    : 'Hãy thử thay đổi từ khóa hoặc đặt lại bộ lọc để tìm kiếm.',
                                action: (_statusFilter != 'ALL' ||
                                        _searchController.text.isNotEmpty)
                                    ? OutlinedButton(
                                        onPressed: () {
                                          _searchController.clear();
                                          _statusFilter = 'ALL';
                                          setState(() {});
                                        },
                                        child: const Text('Đặt lại bộ lọc'),
                                      )
                                    : null,
                              ),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () =>
                            widget.viewModel.loadTeams(widget.competitionId),
                        child: ListView.separated(
                          padding: const EdgeInsets.all(14.0),
                          itemCount: filteredTeams.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 10),
                          itemBuilder: (BuildContext context, int index) {
                            final TeamModel team = filteredTeams[index];
                            return _buildTeamCard(team, currentUserId);
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

  Widget _buildContextTab(String value, String label, bool isSelected) {
    return GestureDetector(
      onTap: () => setState(() => _selectedContext = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: isSelected ? AppColors.primary : const Color(0xFFD1D5DB)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            color: isSelected ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildStatusChip(String value, String label) {
    final bool isSelected = _statusFilter == value;
    return GestureDetector(
      onTap: () => setState(() => _statusFilter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.12)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(5),
          border: Border.all(
              color: isSelected ? AppColors.primary : const Color(0xFFE5E7EB)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            color: isSelected ? AppColors.primary : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  // =========================================================================
  // 6. COMPACT UNIFIED TEAM CARD (AC-02)
  // Thứ tự: Tên đội -> Trạng thái tuyển -> Mô tả ngắn -> Thành viên/Slot -> CTA
  // =========================================================================
  Widget _buildTeamCard(TeamModel team, String? currentUserId) {
    final bool isLeader = currentUserId != null && team.isLeader(currentUserId);
    final bool isMember = currentUserId != null && team.isMember(currentUserId);
    final JoinRequestModel? myRequest =
        widget.viewModel.getMyRequestForTeam(team.id);
    final List<JoinRequestModel> pendingRequests = widget.viewModel
        .getJoinRequestsForTeam(team.id)
        .where((JoinRequestModel r) => r.isPending)
        .toList();

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isLeader
              ? AppColors.primary.withValues(alpha: 0.35)
              : const Color(0xFFE5E7EB),
          width: isLeader ? 1.4 : 0.8,
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x04000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _showTeamDetailSheet(team),
          child: Padding(
            padding: const EdgeInsets.all(14.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                // 1. Tên đội & Badge slot
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        team.name,
                        style: const TextStyle(
                          fontSize: 16.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    StatusBadge(
                      label: 'Slot: ${team.slotDisplay}',
                      backgroundColor: team.isFull
                          ? AppColors.error.withValues(alpha: 0.1)
                          : AppColors.success.withValues(alpha: 0.1),
                      textColor:
                          team.isFull ? AppColors.error : AppColors.success,
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // 2. Trạng thái tuyển: «Đang tuyển» (không mã kỹ thuật) + Slot còn lại
                Row(
                  children: <Widget>[
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: team.isActive
                            ? AppColors.success
                            : AppColors.warning,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      team.statusDisplay,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: team.isActive
                            ? AppColors.success
                            : AppColors.warning,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      'Còn trống: ${team.remainingSlots} slot',
                      style: TextStyle(
                        fontSize: 12,
                        color: team.remainingSlots > 0
                            ? AppColors.primary
                            : AppColors.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),

                // 3. Mô tả ngắn (tối đa 2 dòng)
                if (team.description != null &&
                    team.description!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 8),
                  Text(
                    team.description!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                        height: 1.35),
                  ),
                ],

                const SizedBox(height: 10),
                const Divider(height: 1, color: Color(0xFFE5E7EB)),
                const SizedBox(height: 8),

                // 4. Footer: Số thành viên + CTA theo role
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: <Widget>[
                    Text(
                      '${team.memberCount} thành viên',
                      style: const TextStyle(
                          fontSize: 12.5, color: AppColors.textSecondary),
                    ),

                    // Role-based CTAs
                    if (isLeader) ...<Widget>[
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          if (pendingRequests.isNotEmpty)
                            Badge(
                              label: Text('${pendingRequests.length}'),
                              child: ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.warning,
                                  foregroundColor: Colors.black87,
                                  minimumSize: const Size(44, 32),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () =>
                                    _showLeaderReviewRequestsSheet(team),
                                icon: const Icon(
                                    Icons.notifications_active_rounded,
                                    size: 14),
                                label: const Text('Duyệt yêu cầu',
                                    style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w600)),
                              ),
                            )
                          else
                            OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size(44, 32),
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 10),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(8)),
                              ),
                              onPressed: () =>
                                  _showLeaderReviewRequestsSheet(team),
                              child: const Text('Xem yêu cầu',
                                  style: TextStyle(fontSize: 11.5)),
                            ),
                          const SizedBox(width: 6),
                          StatusBadge(
                            label: 'Trưởng đội',
                            backgroundColor:
                                AppColors.primary.withValues(alpha: 0.12),
                            textColor: AppColors.primary,
                          ),
                          const SizedBox(width: 4),
                          IconButton(
                            icon: const Icon(Icons.delete_outline_rounded,
                                size: 18, color: AppColors.error),
                            tooltip: 'Xóa đội',
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(
                                minWidth: 28, minHeight: 28),
                            onPressed: () =>
                                _showDeleteTeamConfirmationDialog(team),
                          ),
                        ],
                      ),
                    ] else if (isMember) ...<Widget>[
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(44, 32),
                              foregroundColor: AppColors.error,
                              side: const BorderSide(color: AppColors.error),
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 10),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8)),
                            ),
                            onPressed: () async {
                              final bool ok = await widget.viewModel
                                  .leaveTeam(team.id, widget.competitionId);
                              _showFeedbackSnackBar(
                                successMsg:
                                    ok ? widget.viewModel.actionFeedback : null,
                                errorMsg:
                                    !ok ? widget.viewModel.actionError : null,
                              );
                            },
                            child: const Text('Rời Đội',
                                style: TextStyle(fontSize: 11.5)),
                          ),
                        ],
                      ),
                    ] else if (myRequest != null &&
                        myRequest.isPending) ...<Widget>[
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3.5),
                            decoration: BoxDecoration(
                              color: Colors.amber.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'Đã gửi yêu cầu',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.amber,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                          const SizedBox(width: 6),
                          TextButton(
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.error,
                              visualDensity: VisualDensity.compact,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 6),
                            ),
                            onPressed: () async {
                              final bool ok =
                                  await widget.viewModel.withdrawJoinRequest(
                                requestId: myRequest.id,
                                teamId: team.id,
                                competitionId: widget.competitionId,
                              );
                              _showFeedbackSnackBar(
                                successMsg:
                                    ok ? widget.viewModel.actionFeedback : null,
                                errorMsg:
                                    !ok ? widget.viewModel.actionError : null,
                              );
                            },
                            child: const Text('Hủy yêu cầu',
                                style: TextStyle(fontSize: 11.5)),
                          ),
                        ],
                      ),
                    ] else ...<Widget>[
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size(44, 32),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          backgroundColor: team.isFull
                              ? const Color(0xFFD1D5DB)
                              : AppColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8)),
                        ),
                        onPressed: team.isFull
                            ? null
                            : () => _showSendJoinRequestDialog(team),
                        child: Text(
                          team.isFull ? 'Hết chỗ' : 'Xin vào đội',
                          style: const TextStyle(
                              fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ],
                ),

                if (isMember && widget.onOpenTeamSubmission != null)
                  _TeamSubmissionEntry(
                    team: team,
                    isLeader: isLeader,
                    onPressed: () => widget.onOpenTeamSubmission!(
                        team, widget.competitionTitle),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// F37 (Q13): entry to the team submission flow on the member's own team card.
class _TeamSubmissionEntry extends StatelessWidget {
  final TeamModel team;
  final bool isLeader;
  final VoidCallback onPressed;

  const _TeamSubmissionEntry(
      {required this.team, required this.isLeader, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final String? label = switch (team.status) {
      TeamStatus.active when isLeader => 'Nộp hồ sơ đội',
      TeamStatus.submitting =>
        isLeader ? 'Tiếp tục nộp' : 'Xác nhận tham gia nộp',
      TeamStatus.submitted => 'Xem hồ sơ đội',
      _ => null,
    };
    if (label == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: SizedBox(
        width: double.infinity,
        height: 38,
        child: ElevatedButton.icon(
          key: Key('team_submission_entry_${team.id}'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          onPressed: onPressed,
          icon: const Icon(Icons.send_rounded, size: 15),
          label: Text(label,
              style:
                  const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
