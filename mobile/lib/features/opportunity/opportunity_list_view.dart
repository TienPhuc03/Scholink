import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'opportunity_detail_view.dart';
import 'opportunity_model.dart';
import 'opportunity_viewmodel.dart';
import 'widgets/opportunity_card.dart';

/// Opportunity List View implementing MVVM pattern.
/// Satisfies Tuần 1 (F02) and Tuần 2 (F11):
/// - FR-OPP-01: Separate display of Scholarships and Competitions, with common schema & components.
/// - FR-OPP-02: Search & Filter.
/// - FR-OPP-04: Deadlines, source, applyMode.
/// - FR-OPP-06: Local cache with updatedAt, offline support, bookmarking.
/// - FR-UX-02: Clear loading, empty, error, and offline indicators with retry preserving filters.
/// - FR-APP-04: Guest mode browsing, external vs in-app indicators.
class OpportunityListView extends StatefulWidget {
  final OpportunityViewModel viewModel;
  final bool isGuest;
  final void Function(OpportunityModel opportunity)? onOpportunityTap;
  final VoidCallback? onOpenNotificationInbox;

  const OpportunityListView({
    super.key,
    required this.viewModel,
    this.isGuest = false,
    this.onOpportunityTap,
    this.onOpenNotificationInbox,
  });

  @override
  State<OpportunityListView> createState() => _OpportunityListViewState();
}

class _OpportunityListViewState extends State<OpportunityListView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.viewModel.loadOpportunities();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _navigateToDetail(OpportunityModel opp) {
    if (widget.onOpportunityTap != null) {
      widget.onOpportunityTap!(opp);
      return;
    }

    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (BuildContext ctx) => OpportunityDetailView(
          opportunity: opp,
          viewModel: widget.viewModel,
          isGuest: widget.isGuest,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Khám phá Cơ hội'),
        actions: <Widget>[
          if (widget.onOpenNotificationInbox != null)
            IconButton(
              icon: const Icon(Icons.notifications_none_rounded),
              tooltip: 'Hộp thư thông báo',
              onPressed: widget.onOpenNotificationInbox,
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Làm mới',
            onPressed: () => widget.viewModel.loadOpportunities(forceRefresh: true),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          // 1. Search Bar (FR-OPP-02)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Tìm kiếm theo tên, đơn vị, lĩnh vực...',
                prefixIcon: const Icon(Icons.search, size: 22),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 20),
                        onPressed: () {
                          _searchController.clear();
                          widget.viewModel.setSearchQuery('');
                          setState(() {});
                        },
                      )
                    : null,
                filled: true,
                fillColor: Colors.grey.shade100,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
              onChanged: (String val) {
                widget.viewModel.setSearchQuery(val);
                setState(() {});
              },
            ),
          ),

          // 2. Primary Filter Chips: ALL, SCHOLARSHIP, COMPETITION, BOOKMARKED (FR-OPP-01 & FR-OPP-06)
          ListenableBuilder(
            listenable: widget.viewModel,
            builder: (BuildContext context, Widget? child) {
              final String currentFilter = widget.viewModel.selectedTypeFilter;
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
                child: Row(
                  children: <Widget>[
                    _buildFilterChip('ALL', 'Tất cả', currentFilter),
                    const SizedBox(width: 8),
                    _buildFilterChip('SCHOLARSHIP', '🎓 Học bổng', currentFilter),
                    const SizedBox(width: 8),
                    _buildFilterChip('COMPETITION', '🏆 Cuộc thi', currentFilter),
                    const SizedBox(width: 8),
                    _buildFilterChip('BOOKMARKED', '⭐ Đã lưu', currentFilter),
                  ],
                ),
              );
            },
          ),

          // 3. Secondary Filter: Apply Mode (ALL, IN_APP, EXTERNAL)
          ListenableBuilder(
            listenable: widget.viewModel,
            builder: (BuildContext context, Widget? child) {
              final String modeFilter = widget.viewModel.selectedApplyMode;
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 2.0),
                child: Row(
                  children: <Widget>[
                    const Text('Chế độ nộp: ', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                    const SizedBox(width: 4),
                    _buildSmallModeChip('ALL', 'Tất cả', modeFilter),
                    const SizedBox(width: 6),
                    _buildSmallModeChip('IN_APP', 'Nộp online', modeFilter),
                    const SizedBox(width: 6),
                    _buildSmallModeChip('EXTERNAL', 'Nguồn ngoài', modeFilter),
                  ],
                ),
              );
            },
          ),

          // 4. Offline Banner with UpdatedAt timestamp (FR-OPP-06 & FR-UX-02)
          ListenableBuilder(
            listenable: widget.viewModel,
            builder: (BuildContext context, Widget? child) {
              if (widget.viewModel.isOffline) {
                return Container(
                  width: double.infinity,
                  color: Colors.amber.shade100,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.wifi_off_rounded, size: 16, color: Colors.brown),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          widget.viewModel.lastUpdatedAtText != null
                              ? 'Đang ở chế độ ngoại tuyến (Cập nhật lúc: ${widget.viewModel.lastUpdatedAtText})'
                              : 'Đang xem dữ liệu ngoại tuyến đã lưu cục bộ.',
                          style: const TextStyle(fontSize: 12, color: Colors.brown, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                );
              }
              return const SizedBox.shrink();
            },
          ),
          const Divider(height: 1),

          // 5. Main Content: Loading, Error, Empty, Success States (FR-UX-02)
          Expanded(
            child: ListenableBuilder(
              listenable: widget.viewModel,
              builder: (BuildContext context, Widget? child) {
                // Loading State
                if (widget.viewModel.isLoading) {
                  return const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        CircularProgressIndicator(),
                        SizedBox(height: 14),
                        Text('Đang tải danh sách cơ hội...', style: TextStyle(color: AppColors.textSecondary)),
                      ],
                    ),
                  );
                }

                // Error State (with retry retaining filters)
                if (widget.viewModel.hasError && widget.viewModel.items.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          const Icon(Icons.wifi_off_outlined, size: 54, color: AppColors.error),
                          const SizedBox(height: 14),
                          Text(
                            widget.viewModel.errorMessage ?? 'Không thể kết nối đến máy chủ.',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.textPrimary, fontSize: 15),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Bộ lọc hiện tại vẫn được giữ nguyên khi bạn thử lại.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                          ),
                          const SizedBox(height: 18),
                          ElevatedButton.icon(
                            onPressed: () => widget.viewModel.retry(),
                            icon: const Icon(Icons.refresh_rounded),
                            label: const Text('Thử lại'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                // Empty State (distinct from error, per FR-UX-02)
                final List<OpportunityModel> items = widget.viewModel.items;
                if (items.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          const Icon(Icons.search_off_rounded, size: 54, color: AppColors.textMuted),
                          const SizedBox(height: 12),
                          const Text(
                            'Không tìm thấy cơ hội phù hợp',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Hãy thử điều chỉnh từ khóa tìm kiếm hoặc chọn bộ lọc "Tất cả".',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 13.5, color: AppColors.textSecondary),
                          ),
                          const SizedBox(height: 16),
                          OutlinedButton(
                            onPressed: () {
                              _searchController.clear();
                              widget.viewModel.setSearchQuery('');
                              widget.viewModel.setTypeFilter('ALL');
                              widget.viewModel.setApplyModeFilter('ALL');
                            },
                            child: const Text('Đặt lại bộ lọc'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                // Success List State
                return RefreshIndicator(
                  onRefresh: () => widget.viewModel.loadOpportunities(forceRefresh: true),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16.0),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (BuildContext context, int index) {
                      final OpportunityModel item = items[index];
                      return OpportunityCard(
                        item: item,
                        onTap: () => _navigateToDetail(item),
                        onBookmarkTap: () => widget.viewModel.toggleBookmark(item),
                      );
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

  Widget _buildFilterChip(String value, String label, String currentFilter) {
    final bool isSelected = currentFilter == value;
    return FilterChip(
      selected: isSelected,
      label: Text(label),
      labelStyle: TextStyle(
        fontSize: 13,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        color: isSelected ? Colors.white : AppColors.textPrimary,
      ),
      selectedColor: AppColors.primary,
      backgroundColor: AppColors.surface,
      side: BorderSide(
        color: isSelected ? AppColors.primary : AppColors.border,
      ),
      onSelected: (_) => widget.viewModel.setTypeFilter(value),
    );
  }

  Widget _buildSmallModeChip(String value, String label, String currentMode) {
    final bool isSelected = currentMode == value;
    return ChoiceChip(
      selected: isSelected,
      label: Text(label),
      labelStyle: TextStyle(
        fontSize: 11.5,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        color: isSelected ? AppColors.primary : AppColors.textSecondary,
      ),
      selectedColor: AppColors.primary.withOpacity(0.15),
      backgroundColor: Colors.transparent,
      side: BorderSide(
        color: isSelected ? AppColors.primary : Colors.grey.shade300,
      ),
      onSelected: (_) => widget.viewModel.setApplyModeFilter(value),
    );
  }
}
