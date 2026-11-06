import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/constants/app_colors.dart';

/// Shared building blocks for the auth screens (Register, OTP, Forgot/Reset password).
///
/// Visual tokens follow the Figma "Đăng ký" frame (node 202:5464):
/// label 12/16 Inter, input 48px high with 4px radius and #C7C4D8 border,
/// 16px leading icon, primary action 48px high with 6px radius.

const String _brandFont = 'Be Vietnam Pro';
const String _bodyFont = 'Inter';

/// Figma 202:5465 - Header with Scholink brand. Shows a back button when [onBack] is set.
class AuthHeader extends StatelessWidget {
  final VoidCallback? onBack;

  const AuthHeader({super.key, this.onBack});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: EdgeInsets.only(left: onBack != null ? 4 : 16, right: 16),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      child: Row(
        children: <Widget>[
          if (onBack != null)
            IconButton(
              tooltip: 'Quay lại',
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded, color: AppColors.textPrimary, size: 22),
            ),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: Image.asset(
              'assets/images/scholink_logo.png',
              width: 32,
              height: 32,
              fit: BoxFit.contain,
              errorBuilder: (BuildContext context, Object error, StackTrace? stack) {
                return Container(
                  width: 32,
                  height: 32,
                  color: AppColors.primaryLight,
                  child: const Icon(Icons.school_rounded, size: 20, color: AppColors.primary),
                );
              },
            ),
          ),
          const SizedBox(width: 8),
          const Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Scholink',
                style: TextStyle(
                  fontFamily: _brandFont,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  height: 24 / 18,
                  color: AppColors.primary,
                ),
              ),
              Text(
                'Cơ hội cho sinh viên',
                style: TextStyle(
                  fontFamily: _bodyFont,
                  fontSize: 11,
                  height: 14 / 11,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Scaffold used by every auth screen: header + scrollable 16/24 padded content with 20px gaps.
class AuthScaffold extends StatelessWidget {
  final VoidCallback? onBack;
  final List<Widget> children;

  const AuthScaffold({super.key, this.onBack, required this.children});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: <Widget>[
            AuthHeader(onBack: onBack),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: _withGaps(children, 20),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

List<Widget> _withGaps(List<Widget> items, double gap) {
  final List<Widget> out = <Widget>[];
  for (int i = 0; i < items.length; i++) {
    if (i > 0) out.add(SizedBox(height: gap));
    out.add(items[i]);
  }
  return out;
}

/// Figma 202:5475 - Title (20/28 bold) and subtitle (14/20).
class AuthTitle extends StatelessWidget {
  final String title;
  final String subtitle;

  const AuthTitle({super.key, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          title,
          style: const TextStyle(
            fontFamily: _brandFont,
            fontSize: 20,
            fontWeight: FontWeight.w700,
            height: 28 / 20,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          style: const TextStyle(
            fontFamily: _bodyFont,
            fontSize: 14,
            height: 20 / 14,
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}

/// Column of form fields separated by 16px (Figma 202:5478).
class AuthFormSection extends StatelessWidget {
  final List<Widget> children;

  const AuthFormSection({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _withGaps(children, 16),
    );
  }
}

/// Figma 202:5479 - Label + 48px input with a 16px leading icon.
/// Password fields get an eye toggle when [obscurable] is true.
class AuthTextField extends StatefulWidget {
  final String label;
  final String hint;
  final IconData? icon;
  final TextEditingController controller;
  final bool obscurable;
  final String? errorText;
  final TextInputType? keyboardType;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final Iterable<String>? autofillHints;
  final bool enabled;
  final int maxLines;
  final int? maxLength;
  final List<TextInputFormatter>? inputFormatters;

  const AuthTextField({
    super.key,
    required this.label,
    required this.hint,
    this.icon,
    required this.controller,
    this.obscurable = false,
    this.errorText,
    this.keyboardType,
    this.textInputAction = TextInputAction.next,
    this.onSubmitted,
    this.onChanged,
    this.autofillHints,
    this.enabled = true,
    this.maxLines = 1,
    this.maxLength,
    this.inputFormatters,
  });

  @override
  State<AuthTextField> createState() => _AuthTextFieldState();
}

class _AuthTextFieldState extends State<AuthTextField> {
  bool _obscured = true;

  OutlineInputBorder _border(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: BorderSide(color: color, width: width),
      );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          widget.label,
          style: const TextStyle(
            fontFamily: _bodyFont,
            fontSize: 12,
            height: 16 / 12,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: widget.controller,
          enabled: widget.enabled,
          obscureText: widget.obscurable && _obscured,
          keyboardType: widget.keyboardType,
          textInputAction: widget.textInputAction,
          onSubmitted: widget.onSubmitted,
          onChanged: widget.onChanged,
          autofillHints: widget.autofillHints,
          maxLines: widget.obscurable ? 1 : widget.maxLines,
          maxLength: widget.maxLength,
          inputFormatters: widget.inputFormatters,
          style: const TextStyle(
            fontFamily: _bodyFont,
            fontSize: 14,
            height: 20 / 14,
            color: AppColors.textPrimary,
          ),
          decoration: InputDecoration(
            hintText: widget.hint,
            errorText: widget.errorText,
            errorMaxLines: 2,
            filled: true,
            fillColor: AppColors.surface,
            isDense: true,
            contentPadding: EdgeInsets.symmetric(vertical: 14, horizontal: widget.icon == null ? 12 : 0),
            prefixIcon: widget.icon == null ? null : Icon(widget.icon, size: 16, color: AppColors.textMuted),
            prefixIconConstraints: const BoxConstraints(minWidth: 38, minHeight: 46),
            suffixIcon: widget.obscurable
                ? IconButton(
                    tooltip: _obscured ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
                    icon: Icon(
                      _obscured ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                      size: 16,
                      color: AppColors.textMuted,
                    ),
                    onPressed: () => setState(() => _obscured = !_obscured),
                  )
                : null,
            hintStyle: const TextStyle(fontFamily: _bodyFont, fontSize: 14, color: AppColors.textMuted),
            border: _border(AppColors.border),
            enabledBorder: _border(AppColors.border),
            disabledBorder: _border(AppColors.borderLight),
            focusedBorder: _border(AppColors.primary, 1.5),
            errorBorder: _border(AppColors.error),
            focusedErrorBorder: _border(AppColors.error, 1.5),
          ),
        ),
      ],
    );
  }
}

/// Figma 202:5495 - Small muted helper text (11/14 semibold).
class AuthHelperText extends StatelessWidget {
  final String text;

  const AuthHelperText(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: _bodyFont,
        fontSize: 11,
        fontWeight: FontWeight.w600,
        height: 14 / 11,
        color: AppColors.textMuted,
      ),
    );
  }
}

/// Figma 202:5506 - Primary 48px action with leading arrow icon.
class AuthPrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final IconData icon;

  const AuthPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.isLoading = false,
    this.icon = Icons.arrow_forward_rounded,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textOnPrimary,
        disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.5),
        disabledForegroundColor: AppColors.textOnPrimary,
        elevation: 0,
        minimumSize: const Size.fromHeight(48),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      child: isLoading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.textOnPrimary),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Icon(icon, size: 16),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: const TextStyle(
                    fontFamily: _bodyFont,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    height: 20 / 14,
                  ),
                ),
              ],
            ),
    );
  }
}

/// Figma 202:5509 - "hoặc đăng ký bằng" + Google button.
/// Google OAuth is deferred out of the 5-week MVP, so tapping explains that.
class AuthGoogleSection extends StatelessWidget {
  final String caption;

  const AuthGoogleSection({super.key, required this.caption});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          caption,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontFamily: _bodyFont,
            fontSize: 12,
            height: 16 / 12,
            color: AppColors.textMuted,
          ),
        ),
        const SizedBox(height: 12),
        Material(
          color: AppColors.googleButtonBackground,
          borderRadius: BorderRadius.circular(6),
          child: InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Đăng nhập bằng Google chưa có trong bản MVP.')),
              );
            },
            child: const SizedBox(
              height: 48,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  Text(
                    'G',
                    style: TextStyle(
                      fontFamily: _bodyFont,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Tiếp tục với Google',
                    style: TextStyle(
                      fontFamily: _bodyFont,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      height: 20 / 14,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Figma 202:5514 - "Đã có tài khoản? Đăng nhập" style centered link.
class AuthLinkText extends StatelessWidget {
  final String prefix;
  final String link;
  final VoidCallback onTap;

  const AuthLinkText({super.key, required this.prefix, required this.link, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: InkWell(
        borderRadius: BorderRadius.circular(4),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 8),
          child: Text.rich(
            TextSpan(
              style: const TextStyle(
                fontFamily: _bodyFont,
                fontSize: 14,
                height: 20 / 14,
                color: AppColors.textSecondary,
              ),
              children: <InlineSpan>[
                TextSpan(text: prefix),
                TextSpan(
                  text: link,
                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.primary),
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}

enum AuthBannerTone { error, info, success }

/// Inline message banner used for server errors, lock notices and dev OTP hints.
class AuthMessageBanner extends StatelessWidget {
  final String message;
  final AuthBannerTone tone;

  const AuthMessageBanner({super.key, required this.message, this.tone = AuthBannerTone.error});

  @override
  Widget build(BuildContext context) {
    final (Color color, IconData icon) = switch (tone) {
      AuthBannerTone.error => (AppColors.error, Icons.error_outline_rounded),
      AuthBannerTone.info => (AppColors.primary, Icons.info_outline_rounded),
      AuthBannerTone.success => (AppColors.success, Icons.check_circle_outline_rounded),
    };
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontFamily: _bodyFont, fontSize: 12, height: 18 / 12, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Six-box OTP input backed by a single hidden [TextField], so paste and backspace work naturally.
class OtpCodeField extends StatefulWidget {
  final TextEditingController controller;
  final bool enabled;
  final bool hasError;
  final ValueChanged<String>? onCompleted;
  final bool autofocus;

  const OtpCodeField({
    super.key,
    required this.controller,
    this.enabled = true,
    this.hasError = false,
    this.onCompleted,
    this.autofocus = true,
  });

  static const int length = 6;

  @override
  State<OtpCodeField> createState() => _OtpCodeFieldState();
}

class _OtpCodeFieldState extends State<OtpCodeField> {
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
    _focusNode.addListener(_onChanged);
  }

  @override
  void didUpdateWidget(covariant OtpCodeField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onChanged);
      widget.controller.addListener(_onChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    _focusNode.dispose();
    super.dispose();
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final String code = widget.controller.text;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.enabled ? () => _focusNode.requestFocus() : null,
      child: Stack(
        children: <Widget>[
          // Hidden real input that owns keyboard, paste and backspace handling.
          Positioned.fill(
            child: Opacity(
              opacity: 0,
              child: TextField(
                key: const Key('otp_hidden_input'),
                controller: widget.controller,
                focusNode: _focusNode,
                enabled: widget.enabled,
                autofocus: widget.autofocus,
                keyboardType: TextInputType.number,
                autofillHints: const <String>[AutofillHints.oneTimeCode],
                maxLength: OtpCodeField.length,
                showCursor: false,
                enableInteractiveSelection: false,
                inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(counterText: '', border: InputBorder.none),
                onChanged: (String value) {
                  if (value.length == OtpCodeField.length) widget.onCompleted?.call(value);
                },
              ),
            ),
          ),
          IgnorePointer(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List<Widget>.generate(OtpCodeField.length, (int i) {
                final bool filled = i < code.length;
                final bool active = _focusNode.hasFocus && i == code.length.clamp(0, OtpCodeField.length - 1);
                final Color borderColor = widget.hasError
                    ? AppColors.error
                    : active
                        ? AppColors.primary
                        : AppColors.border;
                return Container(
                  width: 46,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: widget.enabled ? AppColors.surface : AppColors.borderLight,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: borderColor, width: active ? 1.5 : 1),
                  ),
                  child: Text(
                    filled ? code[i] : '',
                    style: const TextStyle(
                      fontFamily: _bodyFont,
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Gửi lại mã" link that shows a countdown while the server cooldown is active.
class OtpResendRow extends StatelessWidget {
  final int secondsLeft;
  final bool isSending;
  final VoidCallback onResend;

  const OtpResendRow({
    super.key,
    required this.secondsLeft,
    required this.isSending,
    required this.onResend,
  });

  @override
  Widget build(BuildContext context) {
    final bool canResend = secondsLeft <= 0 && !isSending;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        const Text(
          'Chưa nhận được mã? ',
          style: TextStyle(fontFamily: _bodyFont, fontSize: 14, color: AppColors.textSecondary),
        ),
        TextButton(
          onPressed: canResend ? onResend : null,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            minimumSize: const Size(0, 36),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(
            isSending
                ? 'Đang gửi...'
                : secondsLeft > 0
                    ? 'Gửi lại sau ${secondsLeft}s'
                    : 'Gửi lại mã',
            style: TextStyle(
              fontFamily: _bodyFont,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: canResend ? AppColors.primary : AppColors.textMuted,
            ),
          ),
        ),
      ],
    );
  }
}
