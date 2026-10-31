import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../domain/entities/team_entity.dart';
import '../viewmodels/team_viewmodel.dart';

class TeamListView extends StatefulWidget {
  final TeamViewModel viewModel;
  final String competitionId;
  final String competitionTitle;

  const TeamListView({
    super.key,
    required this.viewModel,
    this.competitionId = 'comp_ai_challenge_2026',
    this.competitionTitle = 'BK AI Challenge 2026',
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

  void _showCreateTeamDialog() {
    final TextEditingController nameController = TextEditingController();
    final TextEditingController descController = TextEditingController();
    int minSize = 2;
    int maxSize = 5;

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
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      const Text(
                        'Tạo Đội Thi Mới',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(
                      labelText: 'Tên đội thi *',
                      hintText: 'Ví dụ: AI Pioneers HCMUT',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: descController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Mô tả & Kỹ năng cần tuyển',
                      hintText: 'Cần tìm bạn mạnh Computer Vision, Backend Python...',
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            const Text('Tối thiểu (Min)', style: TextStyle(fontSize: 12)),
                            const SizedBox(height: 4),
                            DropdownButtonFormField<int>(
                              value: minSize,
                              decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                              items: <int>[2, 3, 4].map((int val) {
                                return DropdownMenuItem<int>(value: val, child: Text('$val bạn'));
                              }).toList(),
                              onChanged: (int? v) {
                                if (v != null) setModalState(() => minSize = v);
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
                            const Text('Tối đa (Max)', style: TextStyle(fontSize: 12)),
                            const SizedBox(height: 4),
                            DropdownButtonFormField<int>(
                              value: maxSize,
                              decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                              items: <int>[2, 3, 4, 5, 6].map((int val) {
                                return DropdownMenuItem<int>(value: val, child: Text('$val bạn'));
                              }).toList(),
                              onChanged: (int? v) {
                                if (v != null) setModalState(() => maxSize = v);
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () async {
                      if (nameController.text.trim().isEmpty) return;
                      Navigator.pop(ctx);
                      final bool ok = await widget.viewModel.createTeam(
                        competitionId: widget.competitionId,
                        name: nameController.text.trim(),
                        description: descController.text.trim().isEmpty ? null : descController.text.trim(),
                        minSize: minSize,
                        maxSize: maxSize,
                      );
                      if (ok && mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text(widget.viewModel.actionFeedback ?? 'Tạo đội thành công!')),
                        );
                      }
                    },
                    child: const Text('Xác nhận Tạo Đội'),
                  ),
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

          final List<TeamEntity> teams = widget.viewModel.teams;
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
                final TeamEntity team = teams[index];
                final bool isMember = currentUserId != null && team.isMember(currentUserId);
                final bool isLeader = currentUserId != null && team.isLeader(currentUserId);

                return Card(
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
                        Text(
                          team.statusDisplay,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: team.isActive ? AppColors.success : AppColors.warning,
                          ),
                        ),
                        if (team.description != null && team.description!.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 8),
                          Text(
                            team.description!,
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
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  '👑 Trưởng Đội',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ),
                            ] else if (isMember) ...<Widget>[
                              OutlinedButton(
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size(90, 34),
                                  foregroundColor: AppColors.error,
                                  side: const BorderSide(color: AppColors.error),
                                  padding: const EdgeInsets.symmetric(horizontal: 12),
                                ),
                                onPressed: () => widget.viewModel.leaveTeam(team.id, widget.competitionId),
                                child: const Text('Rời Đội', style: TextStyle(fontSize: 12)),
                              ),
                            ] else ...<Widget>[
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  minimumSize: const Size(100, 34),
                                  padding: const EdgeInsets.symmetric(horizontal: 12),
                                ),
                                onPressed: team.isFull
                                    ? null
                                    : () => widget.viewModel.joinTeam(team.id, widget.competitionId),
                                child: Text(
                                  team.isFull ? 'Hết slot' : '➕ Xin vào đội',
                                  style: const TextStyle(fontSize: 12),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
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
