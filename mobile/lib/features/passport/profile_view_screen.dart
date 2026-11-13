import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:pdfx/pdfx.dart';
import 'package:url_launcher/url_launcher.dart';
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

  /// Reloads the view quietly (no spinner) and returns the CV with new 5-minute links.
  Future<FileLink?> freshCvLink() async {
    final ProfileView? v = (await _load(_audience)).dataOrNull;
    if (v == null) return null;
    _view = v;
    notifyListeners();
    return v.cvFile;
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

  /// Downloads the CV bytes for the inline preview; tests swap it.
  final BytesLoader? cvLoader;

  const ProfileViewScreen({super.key, required this.viewModel, required this.title, this.note, this.cvLoader});

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
              PassportAvatar(name: v.fullName, url: v.avatarUrl),
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
          if (v.shows('cv') && v.cvFile != null) ...<Widget>[
            const SizedBox(height: 10),
            const Text('CV', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            FileLinkTile(file: v.cvFile!, refresh: vm.freshCvLink),
            // Shown without a tap: the server only sends cvFile to viewers the CV visibility allows.
            if (v.cvFile!.isPdf && v.cvFile!.canOpen) CvPreview(file: v.cvFile!, load: widget.cvLoader),
          ] else if (v.shows('cv') && v.cvAssetId != null)
            // A CV stored before file links existed (or not READY): nothing to open.
            _row('CV', 'Đã đính kèm (tệp chưa sẵn sàng để xem)'),
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

/// Avatar image from its short-lived link, or the first letter of the name when there is no
/// image or it fails to load. A new avatar has a new asset id and so a new URL: no stale cache.
class PassportAvatar extends StatelessWidget {
  final String name;
  final String? url;
  final double radius;

  const PassportAvatar({super.key, required this.name, this.url, this.radius = 24});

  @override
  Widget build(BuildContext context) {
    final String? u = url;
    return CircleAvatar(
      key: ValueKey<String?>(u),
      radius: radius,
      backgroundColor: AppColors.primaryLight,
      foregroundImage: u != null ? NetworkImage(u) : null,
      onForegroundImageError: u != null ? (Object _, StackTrace? __) {} : null,
      child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : 'S',
        style: TextStyle(fontSize: radius * 0.75, fontWeight: FontWeight.w700, color: AppColors.primary),
      ),
    );
  }
}

/// Opens [uri] outside the app (browser or PDF viewer). Swappable in tests.
typedef FileOpener = Future<bool> Function(Uri uri);

Future<bool> _openExternally(Uri uri) => launchUrl(uri, mode: LaunchMode.externalApplication);

/// FR-PROF-04/05: an attached file shown to someone allowed to see it, with view and download.
class FileLinkTile extends StatelessWidget {
  final FileLink file;
  final FileOpener open;

  /// Fetches the file again for links that are still valid: the ones in [file] expire 5 minutes
  /// after the profile was loaded, and a screen can stay open much longer.
  final Future<FileLink?> Function() refresh;

  const FileLinkTile({super.key, required this.file, required this.refresh, this.open = _openExternally});

  Future<void> _go(BuildContext context, {required bool view}) async {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    final FileLink? fresh = await refresh().catchError((Object _) => null);
    final String? url = view ? fresh?.viewUrl : fresh?.downloadUrl;
    final bool ok = url != null && await open(Uri.parse(url)).catchError((Object _) => false);
    if (!ok) {
      messenger.showSnackBar(const SnackBar(content: Text('Không mở được tệp. Kiểm tra mạng rồi thử lại.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      key: Key('file_link_${file.assetId}'),
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      decoration: BoxDecoration(
        color: AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: <Widget>[
          Icon(file.isPdf ? Icons.picture_as_pdf_outlined : Icons.insert_drive_file_outlined,
              color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(file.fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                Text(
                  file.canOpen ? file.summary : '${file.summary} · Tệp chưa có trên kho lưu trữ, cần tải lên lại',
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          if (file.canOpen) ...<Widget>[
            IconButton(
              key: const Key('file_link_view'),
              tooltip: file.isPdf ? 'Xem PDF' : 'Xem tệp',
              onPressed: () => _go(context, view: true),
              icon: const Icon(Icons.visibility_outlined, color: AppColors.primary),
            ),
            IconButton(
              key: const Key('file_link_download'),
              tooltip: 'Tải về',
              onPressed: () => _go(context, view: false),
              icon: const Icon(Icons.download_rounded, color: AppColors.primary),
            ),
          ],
        ],
      ),
    );
  }
}

typedef BytesLoader = Future<Uint8List> Function(String url);

/// The presigned URL carries its own signature, so no app Bearer header (plain Dio, not ApiClient).
Future<Uint8List> _downloadBytes(String url) async {
  final Response<List<int>> res = await Dio().get<List<int>>(url, options: Options(responseType: ResponseType.bytes));
  return Uint8List.fromList(res.data ?? <int>[]);
}

/// FR-PROF-04: the CV pages rendered in the profile (pdfx, Android PdfRenderer), loaded once
/// while the short-lived link is still valid. On failure the download button above still works.
class CvPreview extends StatefulWidget {
  final FileLink file;
  final BytesLoader? load;

  const CvPreview({super.key, required this.file, this.load});

  @override
  State<CvPreview> createState() => _CvPreviewState();
}

class _CvPreviewState extends State<CvPreview> {
  PdfControllerPinch? _controller;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    try {
      final Uint8List bytes = await (widget.load ?? _downloadBytes)(widget.file.viewUrl!);
      if (!mounted) return;
      setState(() => _controller = PdfControllerPinch(document: PdfDocument.openData(bytes)));
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final PdfControllerPinch? c = _controller;
    return Container(
      key: const Key('cv_preview'),
      height: 520,
      margin: const EdgeInsets.only(top: 8),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: _failed
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('Không hiển thị được CV. Bạn vẫn có thể tải về bằng nút ở trên.',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              ),
            )
          : c == null
              ? const Center(child: CircularProgressIndicator())
              : PdfViewPinch(
                  controller: c,
                  onDocumentError: (Object _) => setState(() => _failed = true),
                ),
    );
  }
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
