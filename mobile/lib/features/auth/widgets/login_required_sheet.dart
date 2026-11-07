import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';

/// What a guest chose in [LoginRequiredSheet]; `null` means "Để sau".
enum LoginChoice { login, register }

/// Asks a guest to log in or create an account before an account-only action
/// (account tabs in F10, applying in AUTH-05 / F28). The caller remembers where to return.
class LoginRequiredSheet extends StatelessWidget {
  final String message;

  const LoginRequiredSheet({super.key, required this.message});

  static Future<LoginChoice?> show(BuildContext context, {required String message}) =>
      showModalBottomSheet<LoginChoice>(
        context: context,
        backgroundColor: AppColors.background,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(12))),
        builder: (BuildContext ctx) => LoginRequiredSheet(message: message),
      );

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const Icon(Icons.lock_person_outlined, size: 40, color: AppColors.primary),
            const SizedBox(height: 12),
            const Text(
              'Bạn cần đăng nhập',
              textAlign: TextAlign.center,
              style: TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              key: const Key('login_required_go'),
              onPressed: () => Navigator.of(context).pop(LoginChoice.login),
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
              child: const Text('Đăng nhập'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              key: const Key('login_required_register'),
              onPressed: () => Navigator.of(context).pop(LoginChoice.register),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
              child: const Text('Tạo tài khoản'),
            ),
            const SizedBox(height: 4),
            TextButton(
              key: const Key('login_required_later'),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Để sau'),
            ),
          ],
        ),
      ),
    );
  }
}
