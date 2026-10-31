import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../domain/entities/opportunity_entity.dart';
import '../viewmodels/opportunity_viewmodel.dart';

class OpportunityListView extends StatefulWidget {
  final OpportunityViewModel viewModel;
  final void Function(OpportunityEntity opportunity)? onOpportunityTap;

  const OpportunityListView({
    super.key,
    required this.viewModel,
    this.onOpportunityTap,
  });

  @override
  State<OpportunityListView> createState() => _OpportunityListViewState();
}

class _OpportunityListViewState extends State<OpportunityListView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.viewModel.loadOpportunities();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Khám phá Cơ hội'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => widget.viewModel.loadOpportunities(forceRefresh: true),
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          // Filter Chips
          ListenableBuilder(
            listenable: widget.viewModel,
            builder: (BuildContext context, Widget? child) {
              final String currentFilter = widget.viewModel.selectedFilter;
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: Row(
                  children: <Widget>[
                    _buildFilterChip('ALL', 'Tất cả', currentFilter),
                    const SizedBox(width: 8),
                    _buildFilterChip('SCHOLARSHIP', 'Học bổng', currentFilter),
                    const SizedBox(width: 8),
                    _buildFilterChip('COMPETITION', 'Cuộc thi', currentFilter),
                  ],
                ),
              );
            },
          ),
          const Divider(height: 1),

          // Main Content
          Expanded(
            child: ListenableBuilder(
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
                          const Icon(Icons.wifi_off_outlined, size: 48, color: AppColors.error),
                          const SizedBox(height: 12),
                          Text(
                            widget.viewModel.errorMessage ?? 'Không thể tải danh sách cơ hội',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: AppColors.textPrimary, fontSize: 15),
                          ),
                          const SizedBox(height: 16),
                          OutlinedButton(
                            onPressed: () => widget.viewModel.loadOpportunities(forceRefresh: true),
                            child: const Text('Thử lại'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                final List<OpportunityEntity> items = widget.viewModel.items;
                if (items.isEmpty) {
                  return const Center(
                    child: Text(
                      'Chưa có cơ hội nào phù hợp.',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () => widget.viewModel.loadOpportunities(forceRefresh: true),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16.0),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (BuildContext context, int index) {
                      final OpportunityEntity item = items[index];
                      return _OpportunityCard(
                        item: item,
                        onTap: () => widget.onOpportunityTap?.call(item),
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
      onSelected: (_) => widget.viewModel.setFilter(value),
    );
  }
}

class _OpportunityCard extends StatelessWidget {
  final OpportunityEntity item;
  final VoidCallback? onTap;

  const _OpportunityCard({
    required this.item,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: item.isScholarship
                          ? AppColors.primary.withOpacity(0.1)
                          : AppColors.secondary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      item.typeDisplay,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: item.isScholarship ? AppColors.primary : AppColors.secondary,
                      ),
                    ),
                  ),
                  Text(
                    'Hạn: ${item.registerDeadline}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                item.title,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                item.organizerName,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                item.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
              if (item.tags.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: item.tags.map((String tag) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.border.withOpacity(0.5),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '#$tag',
                        style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
