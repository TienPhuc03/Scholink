import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'passport_model.dart';
import 'passport_repository.dart';

/// Loads one profile view (FR-PROF-05): the student's own Passport previewed for an audience,
/// or a teammate's Passport. Hidden fields never reach the app, so nothing to filter here.
class ProfileViewViewModel extends BaseViewModel {
  final Future<Result<ProfileView, Failure>> Function(ProfileAudience audience) _load;

  /// Audiences the user can switch between; one entry means a fixed view (teammate profile).
  final List<ProfileAudience> audiences;

  ProfileViewViewModel(this._load, {this.audiences = const <ProfileAudience>[ProfileAudience.public]})
      : _audience = audiences.first;

  ProfileAudience _audience;
  ProfileAudience get audience => _audience;

  ProfileView? _view;
  ProfileView? get view => _view;

  Future<void> load() async {
    setLoading();
    final Result<ProfileView, Failure> r = await _load(_audience);
    final Failure? f = r.errorOrNull;
    if (f != null) {
      setError(f.message);
      return;
    }
    _view = r.dataOrNull;
    setSuccess();
  }

  Future<void> switchTo(ProfileAudience next) async {
    if (next == _audience) return;
    _audience = next;
    _view = null;
    await load();
  }
}

class ProfileViewScreen extends StatefulWidget {
  final ProfileViewViewModel viewModel;
  final String title;

  /// Shown above the profile, e.g. "Bạn đang xem hồ sơ của mình như người khác thấy".
  final String? note;

  const ProfileViewScreen({super.key, required this.viewModel, required this.title, this.note});

  @override
  State<ProfileViewScreen> createState() => _ProfileViewScreenState();
}

class _ProfileViewScreenState extends State<ProfileViewScreen> {
  ProfileViewViewModel get vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => vm.load());
  }

  @override
  void dispose() {
    vm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(widget.title),
        shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      body: ListenableBuilder(
        listenable: vm,
        builder: (BuildContext context, Widget? child) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              if (widget.note != null) ...<Widget>[
                Text(widget.note!, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                const SizedBox(height: 12),
              ],
              if (vm.audiences.length > 1) ...<Widget>[
                SegmentedButton<ProfileAudience>(
                  key: const Key('profile_audience'),
                  segments: <ButtonSegment<ProfileAudience>>[
                    for (final ProfileAudience a in vm.audiences)
                      ButtonSegment<ProfileAudience>(value: a, label: Text(a.label)),
                  ],
                  selected: <ProfileAudience>{vm.audience},
                  onSelectionChanged: (Set<ProfileAudience> s) => vm.switchTo(s.first),
                ),
                const SizedBox(height: 16),
              ],
              ..._buildContent(),
            ],
          );
        },
      ),
    );
  }

  List<Widget> _buildContent() {
    final ProfileView? v = vm.view;
    if (vm.isLoading && v == null) {
      return const <Widget>[Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))];
    }
    if (v == null) {
      return <Widget>[
        Text(vm.errorMessage ?? 'Không tải được hồ sơ.', textAlign: TextAlign.center),
        const SizedBox(height: 12),
        Center(child: OutlinedButton(onPressed: vm.load, child: const Text('Thử lại'))),
      ];
    }
    final List<PrivacyFieldInfo> hidden =
        privacyFields.where((PrivacyFieldInfo f) => !v.shows(f.key)).toList();
    return <Widget>[
      _Card(
        children: <Widget>[
          Row(
            children: <Widget>[
              CircleAvatar(
                radius: 24,
                backgroundColor: AppColors.primaryLight,
                child: Text(
                  v.fullName.isNotEmpty ? v.fullName[0].toUpperCase() : 'S',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.primary),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(v.fullName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          if (v.shows('regionCode') && v.regionCode != null) _row('Khu vực', v.regionCode!),
          if (v.shows('bio') && v.bio != null) _row('Giới thiệu', v.bio!),
          if (v.shows('email') && v.email != null) _row('Email', v.email!),
          if (v.shows('phone') && v.phone != null) _row('Số điện thoại', v.phone!),
          if (v.shows('skills') && v.skills.isNotEmpty) _row('Kỹ năng', v.skills.join(', ')),
          if (v.shows('education') && v.education != null)
            _row('Học vấn',
                '${v.education!.institution} · ${v.education!.major} · ${v.education!.yearsDisplay} · GPA ${v.education!.gpaDisplay}'),
          if (v.shows('certificates') && v.certificates.isNotEmpty)
            _row('Chứng chỉ',
                v.certificates.map((CertificateModel c) => '${c.name}${c.score != null ? ' (${c.score})' : ''}').join(', ')),
          if (v.shows('achievements') && v.achievements.isNotEmpty) _row('Thành tích', v.achievements.join('; ')),
          if (v.shows('cv') && v.cvAssetId != null) _row('CV', 'Đã đính kèm'),
          if (v.shows('pitchVideo') && v.pitchVideoAssetId != null) _row('Video giới thiệu', 'Đã đính kèm'),
        ],
      ),
      if (hidden.isNotEmpty) ...<Widget>[
        const SizedBox(height: 12),
        Row(
          key: const Key('profile_hidden_fields'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Icon(Icons.visibility_off_outlined, size: 16, color: AppColors.textMuted),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Không hiển thị: ${hidden.map((PrivacyFieldInfo f) => f.label).join(', ')}.',
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ),
          ],
        ),
      ],
    ];
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SizedBox(
              width: 110,
              child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ),
            Expanded(child: SelectableText(value, style: const TextStyle(fontSize: 13))),
          ],
        ),
      );
}

class _Card extends StatelessWidget {
  final List<Widget> children;

  const _Card({required this.children});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );
}
