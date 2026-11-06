import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/constants/app_colors.dart';
import '../auth/widgets/auth_widgets.dart';
import 'passport_model.dart';
import 'passport_validators.dart';
import 'passport_viewmodel.dart';

/// Passport edit form (F10 / FR-PROF-01). No Figma frame exists yet, so it reuses the
/// input, label and button styles of the Register frame. Pops with `true` after a save.
class PassportEditView extends StatefulWidget {
  final PassportViewModel viewModel;

  const PassportEditView({super.key, required this.viewModel});

  @override
  State<PassportEditView> createState() => _PassportEditViewState();
}

class _PassportEditViewState extends State<PassportEditView> {
  late PassportDraft _draft;
  late String _initialSnapshot;

  final TextEditingController _fullName = TextEditingController();
  final TextEditingController _bio = TextEditingController();
  final TextEditingController _region = TextEditingController();
  final TextEditingController _institution = TextEditingController();
  final TextEditingController _major = TextEditingController();
  final TextEditingController _startYear = TextEditingController();
  final TextEditingController _endYear = TextEditingController();
  final TextEditingController _gpa = TextEditingController();
  final TextEditingController _newSkill = TextEditingController();
  final TextEditingController _newAchievement = TextEditingController();
  double _gpaScale = 4;

  Map<String, String?> _errors = <String, String?>{};

  @override
  void initState() {
    super.initState();
    _loadFrom(widget.viewModel.passport!);
  }

  void _loadFrom(PassportModel p) {
    _draft = PassportDraft.fromPassport(p);
    _fullName.text = _draft.fullName;
    _bio.text = _draft.bio;
    _region.text = _draft.regionCode;
    final EducationModel? edu = _draft.education;
    _institution.text = edu?.institution ?? '';
    _major.text = edu?.major ?? '';
    _startYear.text = edu != null ? '${edu.startYear}' : '';
    _endYear.text = edu?.endYear?.toString() ?? '';
    _gpa.text = edu?.gpa?.toString() ?? '';
    _gpaScale = edu?.gpaScale ?? 4;
    _syncDraftFromFields();
    _initialSnapshot = _snapshot();
  }

  @override
  void dispose() {
    for (final TextEditingController c in <TextEditingController>[
      _fullName,
      _bio,
      _region,
      _institution,
      _major,
      _startYear,
      _endYear,
      _gpa,
      _newSkill,
      _newAchievement,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Copies text fields into the draft; education is only set when the block is filled in.
  void _syncDraftFromFields() {
    _draft
      ..fullName = _fullName.text
      ..bio = _bio.text
      ..regionCode = _region.text;
    final bool hasEducation = _institution.text.trim().isNotEmpty || _major.text.trim().isNotEmpty;
    _draft.education = hasEducation
        ? EducationModel(
            institution: _institution.text.trim(),
            major: _major.text.trim(),
            startYear: int.tryParse(_startYear.text.trim()) ?? 0,
            endYear: int.tryParse(_endYear.text.trim()),
            gpa: double.tryParse(_gpa.text.trim().replaceAll(',', '.')),
            gpaScale: _gpaScale,
          )
        : null;
  }

  String _snapshot() => jsonEncode(_draft.toUpdateJson(expectedVersion: 0));

  bool get _isDirty {
    _syncDraftFromFields();
    return _snapshot() != _initialSnapshot;
  }

  bool _validate() {
    final ({String? institution, String? major, String? startYear, String? endYear, String? gpa}) edu =
        PassportValidators.education(
      institution: _institution.text,
      major: _major.text,
      startYear: _startYear.text,
      endYear: _endYear.text,
      gpa: _gpa.text,
      gpaScale: _gpaScale,
    );
    setState(() {
      _errors = <String, String?>{
        'fullName': PassportValidators.fullName(_fullName.text),
        'bio': PassportValidators.bio(_bio.text),
        'region': PassportValidators.regionCode(_region.text),
        'institution': edu.institution,
        'major': edu.major,
        'startYear': edu.startYear,
        'endYear': edu.endYear,
        'gpa': edu.gpa,
      };
    });
    return _errors.values.every((String? e) => e == null);
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    if (!_validate()) {
      _showSnack('Vui lòng kiểm tra lại các trường được đánh dấu.', isError: true);
      return;
    }
    _syncDraftFromFields();
    final bool ok = await widget.viewModel.save(_draft);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else if (widget.viewModel.hadVersionConflict && widget.viewModel.passport != null) {
      // Server data changed: keep the user's typed values for fields they touched is risky
      // across versions, so reload the fresh copy and let them re-apply edits.
      setState(() => _loadFrom(widget.viewModel.passport!));
    }
  }

  Future<bool> _confirmDiscard() async {
    if (!_isDirty) return true;
    final bool? discard = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('Bỏ thay đổi?'),
        content: const Text('Các thay đổi chưa lưu sẽ bị mất.'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Tiếp tục sửa')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Bỏ thay đổi'),
          ),
        ],
      ),
    );
    return discard ?? false;
  }

  void _showSnack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: isError ? AppColors.error : null),
    );
  }

  void _addSkill() {
    final String? err = PassportValidators.newSkill(_newSkill.text, _draft.skills);
    if (err != null) {
      setState(() => _errors['skill'] = err);
      return;
    }
    setState(() {
      _draft.skills.add(_newSkill.text.trim());
      _newSkill.clear();
      _errors['skill'] = null;
    });
  }

  void _addAchievement() {
    final String? err = PassportValidators.newAchievement(_newAchievement.text, _draft.achievements);
    if (err != null) {
      setState(() => _errors['achievement'] = err);
      return;
    }
    setState(() {
      _draft.achievements.add(_newAchievement.text.trim());
      _newAchievement.clear();
      _errors['achievement'] = null;
    });
  }

  Future<void> _editCertificate([int? index]) async {
    if (index == null && _draft.certificates.length >= PassportValidators.maxCertificates) {
      _showSnack('Tối đa ${PassportValidators.maxCertificates} chứng chỉ.', isError: true);
      return;
    }
    final CertificateModel? result = await showModalBottomSheet<CertificateModel>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(12))),
      builder: (BuildContext ctx) => _CertificateSheet(initial: index != null ? _draft.certificates[index] : null),
    );
    if (result == null) return;
    setState(() {
      if (index != null) {
        _draft.certificates[index] = result;
      } else {
        _draft.certificates.add(result);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, bool? result) async {
        if (didPop) return;
        if (widget.viewModel.isSaving) return;
        final NavigatorState nav = Navigator.of(context);
        if (await _confirmDiscard()) nav.pop(false);
      },
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text('Chỉnh sửa Passport'),
          shape: const Border(bottom: BorderSide(color: AppColors.borderLight)),
        ),
        body: ListenableBuilder(
          listenable: widget.viewModel,
          builder: (BuildContext context, Widget? child) {
            final PassportViewModel vm = widget.viewModel;
            return Column(
              children: <Widget>[
                Expanded(
                  child: ListView(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    children: <Widget>[
                      _buildBasic(),
                      const SizedBox(height: 16),
                      _buildEducation(),
                      const SizedBox(height: 16),
                      _buildSkills(),
                      const SizedBox(height: 16),
                      _buildAchievements(),
                      const SizedBox(height: 16),
                      _buildCertificates(),
                      const SizedBox(height: 16),
                      _buildPreferences(),
                    ],
                  ),
                ),
                _buildSaveBar(vm),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildSaveBar(PassportViewModel vm) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.borderLight)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (vm.saveError != null) ...<Widget>[
              AuthMessageBanner(message: vm.saveError!),
              const SizedBox(height: 10),
            ],
            AuthPrimaryButton(
              key: const Key('passport_save'),
              label: 'Lưu hồ sơ',
              icon: Icons.save_outlined,
              isLoading: vm.isSaving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBasic() {
    return _Section(
      title: 'Thông tin cơ bản',
      icon: Icons.badge_outlined,
      children: <Widget>[
        AuthTextField(
          label: 'Họ và tên',
          hint: 'Nhập họ và tên của bạn',
          icon: Icons.person_outline_rounded,
          controller: _fullName,
          errorText: _errors['fullName'],
        ),
        AuthTextField(
          label: 'Giới thiệu bản thân',
          hint: 'Mục tiêu, lĩnh vực quan tâm, điểm mạnh...',
          controller: _bio,
          maxLines: 4,
          maxLength: PassportValidators.maxBio,
          keyboardType: TextInputType.multiline,
          textInputAction: TextInputAction.newline,
          errorText: _errors['bio'],
        ),
        AuthTextField(
          label: 'Khu vực',
          hint: 'VD: VN-HN, VN-SG',
          icon: Icons.place_outlined,
          controller: _region,
          maxLength: 20,
          errorText: _errors['region'],
        ),
      ],
    );
  }

  Widget _buildEducation() {
    final List<TextInputFormatter> yearOnly = <TextInputFormatter>[
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(4),
    ];
    return _Section(
      title: 'Học vấn',
      icon: Icons.school_outlined,
      subtitle: 'Không bắt buộc. Đã nhập thì cần đủ trường, ngành và năm bắt đầu.',
      children: <Widget>[
        AuthTextField(
          label: 'Trường',
          hint: 'VD: Đại học Bách Khoa TP.HCM',
          icon: Icons.account_balance_outlined,
          controller: _institution,
          errorText: _errors['institution'],
        ),
        AuthTextField(
          label: 'Chuyên ngành',
          hint: 'VD: Khoa học Máy tính',
          icon: Icons.menu_book_outlined,
          controller: _major,
          errorText: _errors['major'],
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Expanded(
              child: AuthTextField(
                label: 'Năm bắt đầu',
                hint: '2023',
                controller: _startYear,
                keyboardType: TextInputType.number,
                inputFormatters: yearOnly,
                errorText: _errors['startYear'],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AuthTextField(
                label: 'Năm kết thúc',
                hint: 'Đang học',
                controller: _endYear,
                keyboardType: TextInputType.number,
                inputFormatters: yearOnly,
                errorText: _errors['endYear'],
              ),
            ),
          ],
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            Expanded(
              child: AuthTextField(
                label: 'GPA',
                hint: _gpaScale == 4 ? 'VD: 3.5' : 'VD: 8.2',
                controller: _gpa,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                errorText: _errors['gpa'],
              ),
            ),
            const SizedBox(width: 12),
            Padding(
              padding: EdgeInsets.only(bottom: _errors['gpa'] != null ? 22 : 0),
              child: SegmentedButton<double>(
                segments: const <ButtonSegment<double>>[
                  ButtonSegment<double>(value: 4, label: Text('Hệ 4')),
                  ButtonSegment<double>(value: 10, label: Text('Hệ 10')),
                ],
                selected: <double>{_gpaScale},
                showSelectedIcon: false,
                style: SegmentedButton.styleFrom(
                  minimumSize: const Size(0, 48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  selectedBackgroundColor: AppColors.primaryLight,
                  selectedForegroundColor: AppColors.primary,
                  side: const BorderSide(color: AppColors.border),
                ),
                onSelectionChanged: (Set<double> s) => setState(() => _gpaScale = s.first),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSkills() {
    return _Section(
      title: 'Kỹ năng',
      icon: Icons.psychology_outlined,
      subtitle: 'Tối đa ${PassportValidators.maxSkills} kỹ năng.',
      children: <Widget>[
        if (_draft.skills.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              for (int i = 0; i < _draft.skills.length; i++)
                InputChip(
                  label: Text(_draft.skills[i], style: const TextStyle(fontSize: 12)),
                  backgroundColor: AppColors.primaryLight,
                  side: BorderSide.none,
                  deleteIconColor: AppColors.textSecondary,
                  onDeleted: () => setState(() => _draft.skills.removeAt(i)),
                ),
            ],
          ),
        _AddRow(
          controller: _newSkill,
          hint: 'VD: Python, Thuyết trình',
          errorText: _errors['skill'],
          onAdd: _addSkill,
          onChanged: () => setState(() => _errors['skill'] = null),
        ),
      ],
    );
  }

  Widget _buildAchievements() {
    return _Section(
      title: 'Thành tích',
      icon: Icons.emoji_events_outlined,
      subtitle: 'Giải thưởng, học bổng đã nhận, hoạt động nổi bật.',
      children: <Widget>[
        for (int i = 0; i < _draft.achievements.length; i++)
          _ListEntry(
            text: _draft.achievements[i],
            onDelete: () => setState(() => _draft.achievements.removeAt(i)),
          ),
        _AddRow(
          controller: _newAchievement,
          hint: 'VD: Giải Nhì Olympic Tin học 2024',
          errorText: _errors['achievement'],
          onAdd: _addAchievement,
          onChanged: () => setState(() => _errors['achievement'] = null),
        ),
      ],
    );
  }

  Widget _buildCertificates() {
    return _Section(
      title: 'Chứng chỉ',
      icon: Icons.workspace_premium_outlined,
      subtitle: 'Chứng chỉ tự khai sẽ ở trạng thái chờ xác minh.',
      children: <Widget>[
        for (int i = 0; i < _draft.certificates.length; i++)
          _ListEntry(
            text: _draft.certificates[i].name,
            detail: <String?>[
              _draft.certificates[i].type,
              _draft.certificates[i].score,
              'Cấp ${_fmtDate(_draft.certificates[i].issuedDate)}',
            ].whereType<String>().join(' · '),
            onTap: () => _editCertificate(i),
            onDelete: () => setState(() => _draft.certificates.removeAt(i)),
          ),
        OutlinedButton.icon(
          onPressed: () => _editCertificate(),
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Thêm chứng chỉ'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.primary,
            backgroundColor: AppColors.surface,
            side: const BorderSide(color: AppColors.border),
            minimumSize: const Size.fromHeight(44),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
          ),
        ),
      ],
    );
  }

  Widget _buildPreferences() {
    Widget tile(String title, String subtitle, bool value, ValueChanged<bool> onChanged) {
      return SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(title, style: const TextStyle(fontSize: 14, color: AppColors.textPrimary)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        value: value,
        activeThumbColor: AppColors.primary,
        onChanged: (bool v) => setState(() => onChanged(v)),
      );
    }

    return _Section(
      title: 'Tùy chọn hiển thị',
      icon: Icons.tune_rounded,
      children: <Widget>[
        tile('Đang tìm đồng đội', 'Cho phép trưởng đội thấy bạn khi ghép đội thi.', _draft.isLookingForTeammate,
            (bool v) => _draft.isLookingForTeammate = v),
        tile('Quan tâm học bổng', 'Ưu tiên gợi ý học bổng phù hợp với hồ sơ.', _draft.isOpenForScholarship,
            (bool v) => _draft.isOpenForScholarship = v),
        tile('Sẵn sàng nhận cố vấn', 'Nhận lời mời từ mentor trong tương lai.', _draft.isOpenForMentoring,
            (bool v) => _draft.isOpenForMentoring = v),
      ],
    );
  }
}

String _fmtDate(DateTime d) {
  final DateTime l = d.toLocal();
  return '${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year}';
}

class _Section extends StatelessWidget {
  final String title;
  final IconData icon;
  final String? subtitle;
  final List<Widget> children;

  const _Section({required this.title, required this.icon, this.subtitle, required this.children});

  @override
  Widget build(BuildContext context) {
    final List<Widget> spaced = <Widget>[];
    for (int i = 0; i < children.length; i++) {
      if (i > 0) spaced.add(const SizedBox(height: 14));
      spaced.add(children[i]);
    }
    // Material (not a coloured Container) so SwitchListTile ink and background stay visible.
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: AppColors.borderLight),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(icon, size: 20, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: const TextStyle(
                    fontFamily: 'Be Vietnam Pro',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
            if (subtitle != null) ...<Widget>[
              const SizedBox(height: 4),
              Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
            ],
            const SizedBox(height: 14),
            ...spaced,
          ],
        ),
      ),
    );
  }
}

class _AddRow extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final String? errorText;
  final VoidCallback onAdd;
  final VoidCallback onChanged;

  const _AddRow({
    required this.controller,
    required this.hint,
    required this.errorText,
    required this.onAdd,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    OutlineInputBorder border(Color c) =>
        OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: BorderSide(color: c));
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(
          child: TextField(
            controller: controller,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => onAdd(),
            onChanged: (_) => onChanged(),
            style: const TextStyle(fontSize: 14, color: AppColors.textPrimary),
            decoration: InputDecoration(
              hintText: hint,
              errorText: errorText,
              isDense: true,
              filled: true,
              fillColor: AppColors.surface,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              border: border(AppColors.border),
              enabledBorder: border(AppColors.border),
              focusedBorder: border(AppColors.primary),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          height: 48,
          child: FilledButton(
            onPressed: onAdd,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryLight,
              foregroundColor: AppColors.primary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
            ),
            child: const Text('Thêm'),
          ),
        ),
      ],
    );
  }
}

class _ListEntry extends StatelessWidget {
  final String text;
  final String? detail;
  final VoidCallback onDelete;
  final VoidCallback? onTap;

  const _ListEntry({required this.text, this.detail, required this.onDelete, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.cardInfoBackground,
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.only(left: 12, top: 6, bottom: 6),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(text, style: const TextStyle(fontSize: 14, color: AppColors.textPrimary)),
                    if (detail != null && detail!.isNotEmpty)
                      Text(detail!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Xóa',
                onPressed: onDelete,
                icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bottom sheet to add or edit one self-declared certificate.
class _CertificateSheet extends StatefulWidget {
  final CertificateModel? initial;

  const _CertificateSheet({this.initial});

  @override
  State<_CertificateSheet> createState() => _CertificateSheetState();
}

class _CertificateSheetState extends State<_CertificateSheet> {
  static const List<String> _types = <String>['IELTS', 'TOEIC', 'TOEFL', 'VSTEP', 'JLPT', 'TIN_HOC', 'OTHER'];

  late final TextEditingController _name = TextEditingController(text: widget.initial?.name ?? '');
  late final TextEditingController _score = TextEditingController(text: widget.initial?.score ?? '');
  late String _type = _types.contains(widget.initial?.type) ? widget.initial!.type : 'OTHER';
  late DateTime? _issued = widget.initial?.issuedDate;
  late DateTime? _expiry = widget.initial?.expiryDate;
  String? _nameError;
  String? _dateError;

  @override
  void dispose() {
    _name.dispose();
    _score.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool issued}) async {
    final DateTime now = DateTime.now();
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: (issued ? _issued : _expiry) ?? now,
      firstDate: DateTime(1990),
      lastDate: issued ? now : DateTime(now.year + 20),
      helpText: issued ? 'Ngày cấp' : 'Ngày hết hạn',
    );
    if (picked == null) return;
    setState(() {
      if (issued) {
        _issued = picked;
      } else {
        _expiry = picked;
      }
      _dateError = null;
    });
  }

  void _submit() {
    setState(() {
      _nameError = PassportValidators.certificateName(_name.text);
      _dateError = PassportValidators.certificateDates(_issued, _expiry);
    });
    if (_nameError != null || _dateError != null) return;
    final String score = _score.text.trim();
    Navigator.of(context).pop(
      CertificateModel(
        type: _type,
        name: _name.text.trim(),
        score: score.isEmpty ? null : score,
        issuedDate: _issued!,
        expiryDate: _expiry,
        assetId: widget.initial?.assetId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    Widget dateButton(String label, DateTime? value, bool issued) => Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _pickDate(issued: issued),
            icon: const Icon(Icons.event_outlined, size: 18),
            label: Text(value != null ? _fmtDate(value) : label),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.textPrimary,
              backgroundColor: AppColors.surface,
              side: const BorderSide(color: AppColors.border),
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
            ),
          ),
        );

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              widget.initial == null ? 'Thêm chứng chỉ' : 'Sửa chứng chỉ',
              style: const TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            AuthTextField(
              label: 'Tên chứng chỉ',
              hint: 'VD: IELTS Academic',
              icon: Icons.workspace_premium_outlined,
              controller: _name,
              errorText: _nameError,
              onChanged: (_) => setState(() => _nameError = null),
            ),
            const SizedBox(height: 14),
            const Text('Loại', style: TextStyle(fontSize: 12, color: AppColors.textPrimary)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _type,
              items: _types
                  .map((String t) => DropdownMenuItem<String>(value: t, child: Text(t == 'OTHER' ? 'Khác' : t)))
                  .toList(),
              onChanged: (String? v) => setState(() => _type = v ?? 'OTHER'),
              decoration: InputDecoration(
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
              ),
            ),
            const SizedBox(height: 14),
            AuthTextField(
              label: 'Điểm / cấp độ (không bắt buộc)',
              hint: 'VD: 7.5, N2, 850',
              controller: _score,
              maxLength: 50,
            ),
            const SizedBox(height: 6),
            Row(
              children: <Widget>[
                dateButton('Ngày cấp', _issued, true),
                const SizedBox(width: 12),
                dateButton('Hết hạn (nếu có)', _expiry, false),
              ],
            ),
            if (_dateError != null) ...<Widget>[
              const SizedBox(height: 6),
              Text(_dateError!, style: const TextStyle(fontSize: 12, color: AppColors.error)),
            ],
            const SizedBox(height: 20),
            AuthPrimaryButton(label: 'Xong', icon: Icons.check_rounded, onPressed: _submit),
          ],
        ),
      ),
    );
  }
}
