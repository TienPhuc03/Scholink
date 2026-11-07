import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/errors/failures.dart';
import '../opportunity/opportunity_model.dart' show deviceZoneLabel;
import 'notification_model.dart';
import 'notification_viewmodel.dart';

/// F29 (NOTI-03): channels and timezone for reminders.
/// - In-app inbox is always on (reminders must stay visible somewhere).
/// - Push asks for the Android notification permission first; a refusal keeps it off and says so.
/// - Timezone decides the quiet hours [22:00, 07:00) the server applies to reminders.
/// Changes are saved only when the server confirms them.
class NotificationSettingsView extends StatefulWidget {
  final NotificationViewModel viewModel;

  const NotificationSettingsView({super.key, required this.viewModel});

  @override
  State<NotificationSettingsView> createState() => _NotificationSettingsViewState();
}

class _NotificationSettingsViewState extends State<NotificationSettingsView> {
  NotificationViewModel get _vm => widget.viewModel;

  // Edits not saved yet; null = same as the server value.
  String? _timezone;
  bool? _push;
  bool? _email;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _vm.loadPreferences());
  }

  bool get _dirty {
    final NotificationPreferences? p = _vm.preferences;
    if (p == null) return false;
    return (_timezone != null && _timezone != p.timezone) ||
        (_push != null && _push != p.pushEnabled) ||
        (_email != null && _email != p.emailEnabled);
  }

  Future<void> _save() async {
    final NotificationPreferences p = _vm.preferences!;
    final Failure? failure = await _vm.savePreferences(
      timezone: _timezone != null && _timezone != p.timezone ? _timezone : null,
      pushEnabled: _push != null && _push != p.pushEnabled ? _push : null,
      emailEnabled: _email != null && _email != p.emailEnabled ? _email : null,
    );
    if (!mounted) return;
    if (failure == null) {
      setState(() {
        _timezone = null;
        _push = null;
        _email = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Đã lưu cài đặt thông báo.'),
        backgroundColor: AppColors.success,
      ));
    } else if (failure is PermissionDeniedFailure) {
      setState(() => _push = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cài đặt thông báo')),
      body: ListenableBuilder(
        listenable: _vm,
        builder: (BuildContext context, Widget? _) {
          final NotificationPreferences? prefs = _vm.preferences;
          if (prefs == null) {
            if (_vm.preferencesLoading) return const Center(child: CircularProgressIndicator());
            return Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    const Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.error),
                    const SizedBox(height: 12),
                    Text(
                      _vm.preferencesError ?? 'Không tải được cài đặt thông báo.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _vm.loadPreferences, child: const Text('Thử lại')),
                  ],
                ),
              ),
            );
          }

          final String tz = _timezone ?? prefs.timezone;
          final List<String> zones = <String>{...kSupportedTimezones, prefs.timezone}.toList();
          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: <Widget>[
              if (_vm.preferencesFromCache)
                Container(
                  color: Colors.amber.shade100,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: const Text(
                    'Đang ngoại tuyến: đây là cài đặt lưu trên máy. Cần có mạng để lưu thay đổi.',
                    style: TextStyle(fontSize: 12.5, color: Colors.brown),
                  ),
                ),
              if (_vm.preferencesError != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      _vm.preferencesError!,
                      key: const Key('prefs_error'),
                      style: const TextStyle(color: AppColors.error, fontSize: 13),
                    ),
                  ),
                ),
              const _Header('Kênh nhận thông báo'),
              const SwitchListTile(
                value: true,
                onChanged: null,
                title: Text('Hộp thư trong ứng dụng'),
                subtitle: Text('Luôn bật: nhắc hạn và cập nhật hồ sơ luôn có trong Hộp thư.'),
              ),
              SwitchListTile(
                key: const Key('prefs_push'),
                value: _push ?? prefs.pushEnabled,
                onChanged: _vm.preferencesSaving ? null : (bool v) => setState(() => _push = v),
                title: const Text('Thông báo đẩy'),
                subtitle: const Text('Cần quyền thông báo của Android. Tắt thì nhắc chỉ vào Hộp thư.'),
              ),
              SwitchListTile(
                key: const Key('prefs_email'),
                value: _email ?? prefs.emailEnabled,
                onChanged: _vm.preferencesSaving ? null : (bool v) => setState(() => _email = v),
                title: const Text('Email'),
                subtitle: const Text('Gửi bản sao nhắc hạn quan trọng tới email tài khoản.'),
              ),
              const Divider(),
              const _Header('Múi giờ & giờ yên lặng'),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: DropdownButtonFormField<String>(
                  key: const Key('prefs_timezone'),
                  initialValue: tz,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Múi giờ của bạn', border: OutlineInputBorder()),
                  items: zones
                      .map((String z) => DropdownMenuItem<String>(value: z, child: Text(z, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: _vm.preferencesSaving ? null : (String? v) => setState(() => _timezone = v),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Text(
                  'Máy của bạn đang ở ${deviceZoneLabel()}. Scholink không gửi nhắc trong khung '
                  '${prefs.quietStart}–${prefs.quietEnd} theo múi giờ đã chọn; nhắc rơi vào khung này được dời '
                  'sang ${prefs.quietEnd} (hoặc sớm hơn nếu hạn chót đến trước). Đổi múi giờ sẽ lập lại các nhắc chưa gửi.',
                  style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
                ),
              ),
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ElevatedButton.icon(
                  key: const Key('prefs_save'),
                  style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: _dirty && !_vm.preferencesSaving ? _save : null,
                  icon: _vm.preferencesSaving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.save_outlined),
                  label: Text(_vm.preferencesSaving ? 'Đang lưu...' : 'Lưu cài đặt'),
                ),
              ),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String text;

  const _Header(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Semantics(
        header: true,
        child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppColors.primary)),
      ),
    );
  }
}
