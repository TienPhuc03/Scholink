import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'team_model.dart';
import 'team_viewmodel.dart';

class TeamListView extends StatefulWidget {
  final TeamViewModel viewModel;
  final String competitionId;
  final String competitionTitle;

  /// F37 (APP-05): opens the team submission flow for the signed-in member's own team.
  final void Function(TeamModel team, String competitionTitle)? onOpenTeamSubmission;

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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.viewModel.loadTeams(widget.competitionId);
    });
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
              const Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
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
  // 1. DIALOG TẠO ĐỘI THI (Form tạo đội: tên, mô tả, kỹ năng, min/max)
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
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: <Widget>[
                        const Text(
                          '🚀 Tạo Đội Thi Mới',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    if (localError != null) ...<Widget>[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.error.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.error.withOpacity(0.3)),
                        ),
                        child: Text(
                          localError!,
                          style: const TextStyle(color: AppColors.error, fontSize: 13),
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
                        hintText: 'Mục tiêu giật giải nhất cuộc thi AI Challenge...',
                        prefixIcon: Icon(Icons.description_outlined),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              const Text('Số thành viên tối thiểu (Min)', style: TextStyle(fontSize: 12)),
                              const SizedBox(height: 4),
                              DropdownButtonFormField<int>(
                                value: minSize,
                                decoration: const InputDecoration(
                                  contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                ),
                                items: <int>[2, 3, 4].map((int val) {
                                  return DropdownMenuItem<int>(value: val, child: Text('$val bạn'));
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
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              const Text('Số thành viên tối đa (Max)', style: TextStyle(fontSize: 12)),
                              const SizedBox(height: 4),
                              DropdownButtonFormField<int>(
                                value: maxSize,
                                decoration: const InputDecoration(
                                  contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                ),
                                items: <int>[2, 3, 4, 5, 6].map((int val) {
                                  return DropdownMenuItem<int>(value: val, child: Text('$val bạn'));
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
                    const SizedBox(height: 24),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: () async {
                        final String name = nameController.text.trim();
                        if (name.isEmpty) {
                          setModalState(() => localError = 'Vui lòng nhập tên đội thi.');
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
                          Navigator.pop(ctx);
                          _showFeedbackSnackBar(successMsg: widget.viewModel.actionFeedback);
                        } else {
                          setModalState(() {
                            localError = widget.viewModel.actionError ?? 'Không thể tạo đội thi.';
                          });
                        }
                      },
                      child: const Text('Xác nhận Tạo Đội Thi', style: TextStyle(fontWeight: FontWeight.bold)),
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
  // 2. DIALOG XIN VÀO ĐỘI (Popup nhập lời nhắn xin vào)
  // =========================================================================
  void _showSendJoinRequestDialog(TeamModel team) {
    final TextEditingController msgController = TextEditingController(
      text: 'Chào anh/chị, em muốn xin tham gia đội để cùng làm mảng AI/CV.',
    );

    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: Text('Xin vào đội: ${team.name}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Slot hiện tại: ${team.slotDisplay} (Còn trống: ${team.remainingSlots} chỗ)',
                style: const TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.w600),
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
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: Colors.white),
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
  // 3. DIALOG / BOTTOM SHEET CHI TIẾT ĐỘI THI (Team Detail View)
  // =========================================================================
  void _showTeamDetailSheet(TeamModel team) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      team.name,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: team.isFull ? AppColors.error.withOpacity(0.1) : AppColors.success.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'Slots: ${team.slotDisplay}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: team.isFull ? AppColors.error : AppColors.success,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                team.statusDisplay,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: team.isActive ? AppColors.success : AppColors.warning,
                ),
              ),
              if (team.description != null && team.description!.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                Text(
                  team.description!,
                  style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
                ),
              ],
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),
              Text(
                'Danh sách Thành viên (${team.memberCount}/${team.maxSize}):',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              ...team.members.map((TeamMemberModel member) {
                final bool isLeader = member.isLeader || member.studentId == team.leaderId;
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: isLeader ? AppColors.primary.withOpacity(0.06) : Colors.grey.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isLeader ? AppColors.primary.withOpacity(0.3) : Colors.transparent,
                    ),
                  ),
                  child: Row(
                    children: <Widget>[
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: isLeader ? AppColors.primary : Colors.grey.shade400,
                        child: Text(
                          member.studentId.isNotEmpty ? member.studentId.substring(0, 1).toUpperCase() : 'U',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              member.studentId,
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            Text(
                              isLeader ? '👑 Trưởng Đội (Leader)' : '👤 Thành Viên (Member)',
                              style: TextStyle(
                                fontSize: 12,
                                color: isLeader ? AppColors.primary : AppColors.textMuted,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        '${member.joinedAt.day}/${member.joinedAt.month}/${member.joinedAt.year}',
                        style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Đóng'),
                ),
              ),
            ],
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
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (BuildContext ctx) {
        return ListenableBuilder(
          listenable: widget.viewModel,
          builder: (BuildContext context, Widget? _) {
            final List<JoinRequestModel> allRequests = widget.viewModel.getJoinRequestsForTeam(team.id);
            final List<JoinRequestModel> pendingRequests =
                allRequests.where((JoinRequestModel r) => r.isPending).toList();

            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      Text(
                        'Yêu cầu xin vào: ${team.name}',
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                      ),
                      IconButton(
                        icon: const Icon(Icons.refresh),
                        onPressed: () => widget.viewModel.loadJoinRequests(team.id),
                      ),
                    ],
                  ),
                  Text(
                    'Hiện có ${pendingRequests.length} yêu cầu đang chờ duyệt (Slot: ${team.slotDisplay})',
                    style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 16),
                  if (pendingRequests.isEmpty) ...<Widget>[
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 32),
                      child: Center(
                        child: Text(
                          'Không có yêu cầu nào đang chờ duyệt.',
                          style: TextStyle(color: AppColors.textSecondary),
                        ),
                      ),
                    ),
                  ] else ...<Widget>[
                    ...pendingRequests.map((JoinRequestModel req) {
                      final bool isProcessing = widget.viewModel.isRequestProcessing(req.id);

                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.all(12.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Row(
                                children: <Widget>[
                                  const Icon(Icons.person_pin, color: AppColors.primary, size: 20),
                                  const SizedBox(width: 8),
                                  Text(
                                    req.applicantId,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  ),
                                  const Spacer(),
                                  Text(
                                    '${req.appliedAt.hour}:${req.appliedAt.minute.toString().padLeft(2, '0')}',
                                    style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                                  ),
                                ],
                              ),
                              if (req.message != null && req.message!.isNotEmpty) ...<Widget>[
                                const SizedBox(height: 6),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.withOpacity(0.08),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '"${req.message}"',
                                    style: const TextStyle(fontSize: 13, fontStyle: FontStyle.italic),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 12),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: <Widget>[
                                  OutlinedButton.icon(
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: AppColors.error,
                                      side: const BorderSide(color: AppColors.error),
                                      minimumSize: const Size(80, 32),
                                    ),
                                    onPressed: isProcessing
                                        ? null
                                        : () async {
                                            final bool ok = await widget.viewModel.reviewJoinRequest(
                                              teamId: team.id,
                                              requestId: req.id,
                                              decision: 'REJECT',
                                              competitionId: widget.competitionId,
                                            );
                                            _showFeedbackSnackBar(
                                              successMsg: ok ? widget.viewModel.actionFeedback : null,
                                              errorMsg: !ok ? widget.viewModel.actionError : null,
                                            );
                                          },
                                    icon: const Icon(Icons.close, size: 16),
                                    label: const Text('Từ chối', style: TextStyle(fontSize: 12)),
                                  ),
                                  const SizedBox(width: 8),
                                  ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.success,
                                      foregroundColor: Colors.white,
                                      minimumSize: const Size(100, 32),
                                    ),
                                    onPressed: isProcessing
                                        ? null
                                        : () async {
                                            final bool ok = await widget.viewModel.reviewJoinRequest(
                                              teamId: team.id,
                                              requestId: req.id,
                                              decision: 'ACCEPT',
                                              competitionId: widget.competitionId,
                                            );
                                            _showFeedbackSnackBar(
                                              successMsg: ok ? widget.viewModel.actionFeedback : null,
                                              errorMsg: !ok ? widget.viewModel.actionError : null,
                                            );
                                          },
                                    icon: isProcessing
                                        ? const SizedBox(
                                            width: 14,
                                            height: 14,
                                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                          )
                                        : const Icon(Icons.check, size: 16),
                                    label: Text(
                                      isProcessing ? 'Đang duyệt...' : 'Duyệt vào đội',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.competitionTitle),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Làm mới',
            onPressed: () => widget.viewModel.loadTeams(widget.competitionId),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.group_add_rounded),
        label: const Text('Tạo Đội'),
        onPressed: _showCreateTeamDialog,
      ),
      body: ListenableBuilder(
        listenable: widget.viewModel,
        builder: (BuildContext context, Widget? child) {
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
                      widget.viewModel.errorMessage ?? 'Không thể tải danh sách đội',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textPrimary, fontSize: 15),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: () => widget.viewModel.loadTeams(widget.competitionId),
                      child: const Text('Thử lại'),
                    ),
                  ],
                ),
              ),
            );
          }

          final List<TeamModel> teams = widget.viewModel.teams;
          if (teams.isEmpty) {
            return const Center(
              child: Text(
                'Chưa có đội thi nào. Hãy là người đầu tiên tạo đội!',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
              ),
            );
          }

          final String? currentUserId = widget.viewModel.currentUserId;

          return RefreshIndicator(
            onRefresh: () => widget.viewModel.loadTeams(widget.competitionId),
            child: ListView.separated(
              padding: const EdgeInsets.all(16.0),
              itemCount: teams.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (BuildContext context, int index) {
                final TeamModel team = teams[index];
                final bool isMember = currentUserId != null && team.isMember(currentUserId);
                final bool isLeader = currentUserId != null && team.isLeader(currentUserId);
                final JoinRequestModel? myRequest = widget.viewModel.getMyRequestForTeam(team.id);
                final List<JoinRequestModel> pendingRequests = widget.viewModel
                    .getJoinRequestsForTeam(team.id)
                    .where((JoinRequestModel r) => r.isPending)
                    .toList();

                return Card(
                  elevation: 2,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(
                      color: isLeader ? AppColors.primary.withOpacity(0.5) : Colors.grey.withOpacity(0.2),
                    ),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => _showTeamDetailSheet(team),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          // Header: Name & Status
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: <Widget>[
                              Expanded(
                                child: Text(
                                  team.name,
                                  style: const TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: team.isFull
                                      ? AppColors.error.withOpacity(0.1)
                                      : AppColors.success.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'Slot: ${team.slotDisplay}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: team.isFull ? AppColors.error : AppColors.success,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: <Widget>[
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: team.isActive ? AppColors.success : AppColors.warning,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                team.statusDisplay,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: team.isActive ? AppColors.success : AppColors.warning,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                'Còn trống: ${team.remainingSlots} slot',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: team.remainingSlots > 0 ? AppColors.primary : AppColors.error,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          if (team.description != null && team.description!.isNotEmpty) ...<Widget>[
                            const SizedBox(height: 8),
                            Text(
                              team.description!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                            ),
                          ],
                          const SizedBox(height: 12),
                          const Divider(height: 1),
                          const SizedBox(height: 10),

                          // Action Buttons
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: <Widget>[
                              Text(
                                '${team.memberCount} thành viên',
                                style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
                              ),
                              if (isLeader) ...<Widget>[
                                Row(
                                  children: <Widget>[
                                    if (pendingRequests.isNotEmpty)
                                      Badge(
                                        label: Text('${pendingRequests.length}'),
                                        child: ElevatedButton.icon(
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: AppColors.warning,
                                            foregroundColor: Colors.black87,
                                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                            minimumSize: const Size(80, 32),
                                          ),
                                          onPressed: () => _showLeaderReviewRequestsSheet(team),
                                          icon: const Icon(Icons.notifications_active, size: 14),
                                          label: const Text('Duyệt xin vào', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                        ),
                                      )
                                    else
                                      OutlinedButton(
                                        style: OutlinedButton.styleFrom(
                                          minimumSize: const Size(80, 32),
                                          padding: const EdgeInsets.symmetric(horizontal: 10),
                                        ),
                                        onPressed: () => _showLeaderReviewRequestsSheet(team),
                                        child: const Text('Xem yêu cầu', style: TextStyle(fontSize: 11)),
                                      ),
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: const Text(
                                        '👑 Trưởng Đội',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: AppColors.primary,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ] else if (isMember) ...<Widget>[
                                OutlinedButton(
                                  style: OutlinedButton.styleFrom(
                                    minimumSize: const Size(90, 34),
                                    foregroundColor: AppColors.error,
                                    side: const BorderSide(color: AppColors.error),
                                    padding: const EdgeInsets.symmetric(horizontal: 12),
                                  ),
                                  onPressed: () async {
                                    final bool ok = await widget.viewModel.leaveTeam(team.id, widget.competitionId);
                                    _showFeedbackSnackBar(
                                      successMsg: ok ? widget.viewModel.actionFeedback : null,
                                      errorMsg: !ok ? widget.viewModel.actionError : null,
                                    );
                                  },
                                  child: const Text('Rời Đội', style: TextStyle(fontSize: 12)),
                                ),
                              ] else if (myRequest != null && myRequest.isPending) ...<Widget>[
                                Row(
                                  children: <Widget>[
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: Colors.amber.withOpacity(0.15),
                                        borderRadius: BorderRadius.circular(6),
                                        border: Border.all(color: Colors.amber.shade700),
                                      ),
                                      child: const Text(
                                        '⏳ Đang chờ duyệt',
                                        style: TextStyle(fontSize: 11, color: Colors.amber, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    TextButton(
                                      style: TextButton.styleFrom(foregroundColor: AppColors.error),
                                      onPressed: () async {
                                        final bool ok = await widget.viewModel.withdrawJoinRequest(
                                          requestId: myRequest.id,
                                          teamId: team.id,
                                          competitionId: widget.competitionId,
                                        );
                                        _showFeedbackSnackBar(
                                          successMsg: ok ? widget.viewModel.actionFeedback : null,
                                          errorMsg: !ok ? widget.viewModel.actionError : null,
                                        );
                                      },
                                      child: const Text('Rút đơn', style: TextStyle(fontSize: 11)),
                                    ),
                                  ],
                                ),
                              ] else ...<Widget>[
                                ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    minimumSize: const Size(100, 34),
                                    padding: const EdgeInsets.symmetric(horizontal: 12),
                                    backgroundColor: team.isFull ? Colors.grey : AppColors.primary,
                                    foregroundColor: Colors.white,
                                  ),
                                  onPressed: team.isFull
                                      ? null
                                      : () => _showSendJoinRequestDialog(team),
                                  child: Text(
                                    team.isFull ? '🔒 Đã đủ slot' : '➕ Xin vào đội',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          if (isMember && widget.onOpenTeamSubmission != null)
                            _TeamSubmissionEntry(
                              team: team,
                              isLeader: isLeader,
                              onPressed: () => widget.onOpenTeamSubmission!(team, widget.competitionTitle),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

/// F37 (Q13): entry to the team submission flow on the member's own team card.
class _TeamSubmissionEntry extends StatelessWidget {
  final TeamModel team;
  final bool isLeader;
  final VoidCallback onPressed;

  const _TeamSubmissionEntry({required this.team, required this.isLeader, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final String? label = switch (team.status) {
      TeamStatus.active when isLeader => 'Nộp hồ sơ đội',
      TeamStatus.submitting => isLeader ? 'Tiếp tục nộp' : 'Xác nhận tham gia nộp',
      TeamStatus.submitted => 'Xem hồ sơ đội',
      _ => null,
    };
    if (label == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          key: Key('team_submission_entry_${team.id}'),
          onPressed: onPressed,
          icon: const Icon(Icons.send_rounded, size: 16),
          label: Text(label, style: const TextStyle(fontSize: 13)),
        ),
      ),
    );
  }
}
