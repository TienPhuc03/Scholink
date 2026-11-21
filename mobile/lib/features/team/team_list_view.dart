import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/widgets/skeleton_loader.dart';
import 'team_model.dart';
import 'team_viewmodel.dart';

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
                    const SizedBox(height: 14),

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

                    // Tên đội
                    TextField(
                      controller: nameController,
                      decoration: const InputDecoration(
                        labelText: 'Tên đội thi (*)',
                        hintText: 'Nhập tên đội độc đáo...',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 14),

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
                    const SizedBox(height: 14),

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
                    const SizedBox(height: 14),

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
                    const SizedBox(height: 20),

                    // CTA Tạo đội
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4338CA),
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
                          CircleAvatar(
                            radius: 16,
                            backgroundColor: const Color(0xFFEEF0FD),
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
                            fontSize: 15,
                            fontWeight:
                                isExplore ? FontWeight.w700 : FontWeight.w600,
                            color: isExplore
                                ? const Color(0xFF4338CA)
                                : const Color(0xFF475569),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          height: 3,
                          decoration: BoxDecoration(
                            color: isExplore
                                ? const Color(0xFF4338CA)
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
                            fontSize: 15,
                            fontWeight:
                                isMyTeams ? FontWeight.w700 : FontWeight.w600,
                            color: isMyTeams
                                ? const Color(0xFF4338CA)
                                : const Color(0xFF475569),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          height: 3,
                          decoration: BoxDecoration(
                            color: isMyTeams
                                ? const Color(0xFF4338CA)
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

  /// 2. Search Box + Filter Button Row (1:1 with Design)
  Widget _buildSearchAndFilterRow() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
      child: Row(
        children: <Widget>[
          // Search Field
          Expanded(
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(fontSize: 13.5, color: Color(0xFF0F172A)),
                decoration: const InputDecoration(
                  hintText: 'Tìm theo tên đội hoặc kỹ năng...',
                  hintStyle:
                      TextStyle(fontSize: 13.5, color: Color(0xFF94A3B8)),
                  prefixIcon: Icon(Icons.search_rounded,
                      size: 20, color: Color(0xFF94A3B8)),
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(vertical: 12),
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Filter Button
          InkWell(
            onTap: _showFilterBottomSheet,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              height: 44,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(Icons.filter_alt_outlined,
                      size: 18, color: Color(0xFF475569)),
                  SizedBox(width: 6),
                  Text(
                    'Bộ lọc',
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFF1E293B),
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
              fontSize: 13,
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
                    fontSize: 13,
                    color: Color(0xFF475569),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 2),
                const Icon(Icons.keyboard_arrow_down_rounded,
                    size: 18, color: Color(0xFF475569)),
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
                  // Lavender Avatar Box
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF0FD),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.groups_rounded,
                      color: Color(0xFF4338CA),
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Team Title & Competition Subtitle
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          team.name,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.competitionTitle,
                          style: const TextStyle(
                            fontSize: 13,
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
                              fontSize: 12,
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
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                ],
              ),

            // Description
            const SizedBox(height: 12),
            Text(
              team.description?.isNotEmpty == true
                  ? team.description!
                  : 'Tìm đồng đội có kinh nghiệm OpenCV, cùng giải quyết bài toán nhận diện hình ảnh.',
              style: const TextStyle(
                fontSize: 14,
                color: Color(0xFF334155),
                height: 1.45,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),

            // Metadata Row: 👥 1/4 thành viên | </> OpenCV • Thị giác máy tính
            const SizedBox(height: 14),
            Row(
              children: <Widget>[
                const Icon(Icons.people_outline_rounded,
                    size: 18, color: Color(0xFF475569)),
                const SizedBox(width: 6),
                Text(
                  '${team.slotDisplay} thành viên',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF475569),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 10),
                  child: Text('|',
                      style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13)),
                ),
                const Icon(Icons.code_rounded,
                    size: 18, color: Color(0xFF475569)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    skillsDisplay,
                    style: const TextStyle(
                      fontSize: 13,
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
            backgroundColor: const Color(0xFF4338CA),
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () => _showLeaderReviewRequestsSheet(team),
          child: const Text('Quản lý đội',
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
        ),
      );
    }

    if (isMember) {
      return BouncingWidget(
        onTap: () => _showTeamDetailSheet(team),
        scaleDown: 0.94,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFF4338CA),
            side: const BorderSide(color: Color(0xFF4338CA), width: 1.2),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () => _showTeamDetailSheet(team),
          child: const Text('Đã tham gia',
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
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
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: Color(0xFFB45309))),
      );
    }

    return BouncingWidget(
      onTap: team.isFull ? null : () => _showSendJoinRequestDialog(team),
      scaleDown: 0.94,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF4338CA),
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
        onPressed: team.isFull ? null : () => _showSendJoinRequestDialog(team),
        child: Text(
          team.isFull ? 'Hết chỗ' : 'Xin vào đội',
          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
