import 'package:flutter/material.dart';
import '../constants/app_colors.dart';

/// Shown above data that is still on screen when a reload failed (offline, server error),
/// so the user knows it may be outdated and can retry (F37, Q6/Q12).
class RefreshErrorBanner extends StatelessWidget {
  final String? message;
  final VoidCallback onRetry;

  const RefreshErrorBanner({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('refresh_error_banner'),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: <Widget>[
          const Icon(Icons.cloud_off_rounded, size: 18, color: AppColors.warning),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Chưa cập nhật được dữ liệu mới. ${message ?? ''}'.trim(),
              style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Thử lại')),
        ],
      ),
    );
  }
}
