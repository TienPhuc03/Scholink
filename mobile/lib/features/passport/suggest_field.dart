import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../auth/widgets/auth_widgets.dart';
import 'passport_model.dart';

typedef SuggestionLoader = Future<Result<List<ProfileSuggestion>, Failure>> Function(String query);

/// Text field with server suggestions under it while the user types (Passport autocomplete).
/// Typed text is kept as is; picking a suggestion only fills the field faster.
class SuggestField extends StatefulWidget {
  final String label;
  final String hint;
  final IconData icon;
  final TextEditingController controller;
  final SuggestionLoader load;
  final String? errorText;
  final int? maxLength;
  final ValueChanged<String>? onChanged;

  /// Also shows suggestions for an empty field when it gains focus (e.g. majors of the chosen school).
  final bool suggestWhenEmpty;

  const SuggestField({
    super.key,
    required this.label,
    required this.hint,
    required this.icon,
    required this.controller,
    required this.load,
    this.errorText,
    this.maxLength,
    this.onChanged,
    this.suggestWhenEmpty = false,
  });

  @override
  State<SuggestField> createState() => _SuggestFieldState();
}

class _SuggestFieldState extends State<SuggestField> {
  static const Duration _debounce = Duration(milliseconds: 300);

  Timer? _timer;
  int _request = 0;
  bool _open = false;
  bool _loading = false;
  String? _error;
  List<ProfileSuggestion> _items = const <ProfileSuggestion>[];

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _close() {
    _timer?.cancel();
    _request++; // drop answers that are still on the way
    if (_open) setState(() => _open = false);
  }

  void _query(String text) {
    _timer?.cancel();
    if (text.trim().isEmpty && !widget.suggestWhenEmpty) {
      _close();
      return;
    }
    setState(() {
      _open = true;
      _loading = true;
      _error = null;
    });
    _timer = Timer(_debounce, () => _fetch(text));
  }

  Future<void> _fetch(String text) async {
    final int id = ++_request;
    final Result<List<ProfileSuggestion>, Failure> r = await widget.load(text.trim());
    if (!mounted || id != _request) return;
    setState(() {
      _loading = false;
      _error = r.errorOrNull == null ? null : 'Không tải được gợi ý. Bạn vẫn có thể tự nhập.';
      _items = r.dataOrNull ?? const <ProfileSuggestion>[];
      // Nothing to show for an empty field: keep the box closed rather than say "not found".
      if (text.trim().isEmpty && _items.isEmpty) _open = false;
    });
  }

  void _pick(ProfileSuggestion s) {
    widget.controller.value = TextEditingValue(
      text: s.value,
      selection: TextSelection.collapsed(offset: s.value.length),
    );
    widget.onChanged?.call(s.value);
    _close();
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      skipTraversal: true,
      onFocusChange: (bool has) {
        if (!has) {
          _close();
        } else if (widget.suggestWhenEmpty && widget.controller.text.trim().isEmpty) {
          _query('');
        }
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          AuthTextField(
            label: widget.label,
            hint: widget.hint,
            icon: widget.icon,
            controller: widget.controller,
            errorText: widget.errorText,
            maxLength: widget.maxLength,
            onChanged: (String v) {
              widget.onChanged?.call(v);
              _query(v);
            },
          ),
          if (_open) _box(),
        ],
      ),
    );
  }

  Widget _box() {
    Widget message(String text) => Padding(
          padding: const EdgeInsets.all(12),
          child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
        );

    final Widget content;
    if (_loading) {
      content = const Padding(
        padding: EdgeInsets.all(12),
        child: Row(
          children: <Widget>[
            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 10),
            Text('Đang tìm gợi ý...', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          ],
        ),
      );
    } else if (_error != null) {
      content = message(_error!);
    } else if (_items.isEmpty) {
      content = message('Không có gợi ý phù hợp. Bạn vẫn có thể giữ nội dung đã nhập.');
    } else {
      content = Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          for (final ProfileSuggestion s in _items)
            InkWell(
              key: Key('suggestion_${s.value}'),
              onTap: () => _pick(s),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(s.value, style: const TextStyle(fontSize: 14, color: AppColors.textPrimary)),
                          if (s.detail != null)
                            Text(s.detail!, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                        ],
                      ),
                    ),
                    const Icon(Icons.north_west_rounded, size: 16, color: AppColors.textMuted),
                  ],
                ),
              ),
            ),
        ],
      );
    }

    return Container(
      key: const Key('suggestion_box'),
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.border),
        boxShadow: const <BoxShadow>[BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: content,
    );
  }
}
