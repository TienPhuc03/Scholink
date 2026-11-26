import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/services/user_avatar_service.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import '../application/attachment_model.dart';
import '../application/media_repository.dart';
import 'passport_model.dart';
import 'passport_repository.dart';

/// A file kept on the Passport itself (FR-PROF-04), uploaded through the media flow.
enum PassportDocument {
  cv('CV', 'cvAssetId', 'CV (PDF)', <String>['pdf']),
  avatar('AVATAR', 'avatarAssetId', 'Ảnh đại diện',
      <String>['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

  final String category;
  final String field;
  final String label;
  final List<String> extensions;

  const PassportDocument(
      this.category, this.field, this.label, this.extensions);

  static const int maxBytes = 5 * 1024 * 1024;

  static String? mimeFor(String fileName) =>
      switch (fileName.split('.').last.toLowerCase()) {
        'pdf' => 'application/pdf',
        'jpg' || 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'heic' || 'heif' => 'image/jpeg',
        _ => null,
      };

  /// Same size/type/magic-byte checks the backend runs, so a bad file fails before upload.
  String? validate(String fileName, Uint8List bytes) {
    final String ext = fileName.split('.').last.toLowerCase();
    final String? mime = mimeFor(fileName);
    if (mime == null || !extensions.contains(ext)) {
      return '$label chỉ nhận ${extensions.map((String e) => e.toUpperCase()).join(', ')}.';
    }
    if (bytes.isEmpty) return 'Tệp rỗng.';
    if (bytes.length > maxBytes) return 'Tệp vượt quá 5 MB.';
    bool starts(List<int> sig) =>
        bytes.length >= sig.length &&
        List<int>.generate(sig.length, (int i) => bytes[i]).join(',') ==
            sig.join(',');
    final bool ok = switch (mime) {
      'application/pdf' => starts(<int>[0x25, 0x50, 0x44, 0x46]),
      'image/png' => starts(<int>[0x89, 0x50, 0x4E, 0x47]),
      'image/jpeg' => starts(<int>[0xFF, 0xD8, 0xFF]) ||
          (bytes.length >= 12 &&
              String.fromCharCodes(bytes.sublist(4, 8)) == 'ftyp'),
      'image/webp' => starts(<int>[0x52, 0x49, 0x46, 0x46]) &&
          bytes.length >= 12 &&
          String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP',
      _ => false,
    };
    return ok
        ? null
        : 'Nội dung tệp không khớp định dạng ${ext.toUpperCase()}.';
  }
}

/// Picks a file with one of [extensions]; null when the user cancels.
typedef PassportFilePicker = Future<PickedAttachment?> Function(
    List<String> extensions);

Future<PickedAttachment?> _pickWithPlugin(List<String> extensions) async {
  final FilePickerResult? result = await FilePicker.pickFiles(
      type: FileType.custom, allowedExtensions: extensions, withData: true);
  final PlatformFile? file = result?.files.firstOrNull;
  if (file == null || file.bytes == null) return null;
  return PickedAttachment(name: file.name, bytes: file.bytes!);
}

/// ViewModel managing state and operations for Passport in MVVM architecture.
class PassportViewModel extends BaseViewModel {
  final PassportRepository _repository;
  final MediaRepository? _media;
  final PassportFilePicker _pick;

  /// The document being uploaded, or null.
  PassportDocument? _uploading;
  PassportDocument? get uploading => _uploading;

  String? _documentError;
  String? get documentError => _documentError;

  PassportModel? _passport;
  PassportModel? get passport => _passport;

  bool _isSaving = false;
  bool get isSaving => _isSaving;

  String? _saveError;
  String? get saveError => _saveError;

  /// True after a 409 VERSION_MISMATCH: the Passport was changed elsewhere and has been reloaded.
  bool _hadVersionConflict = false;
  bool get hadVersionConflict => _hadVersionConflict;

  Uint8List? _localAvatarBytes;
  Uint8List? get localAvatarBytes => _localAvatarBytes;

  static const String _avatarStorageKey = 'scholink_user_avatar_b64';

  Future<void> initLocalAvatar() async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      final String? b64 = prefs.getString(_avatarStorageKey);
      if (b64 != null && b64.isNotEmpty) {
        _localAvatarBytes = base64Decode(b64);
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> saveLocalAvatar(Uint8List bytes) async {
    _localAvatarBytes = bytes;
    notifyListeners();
    await UserAvatarService.instance.setAvatarBytes(bytes);
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(_avatarStorageKey, base64Encode(bytes));
    } catch (_) {}
  }

  Future<void> clearLocalAvatar() async {
    _localAvatarBytes = null;
    notifyListeners();
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.remove(_avatarStorageKey);
    } catch (_) {}
  }

  PassportViewModel(this._repository,
      {MediaRepository? media, PassportFilePicker? pick})
      : _media = media,
        _pick = pick ?? _pickWithPlugin;

  bool get canUploadDocuments => _media != null;

  /// Picks, checks and uploads [doc], then links it to the Passport. Returns true on success.
  Future<bool> uploadDocument(PassportDocument doc) async {
    final MediaRepository? media = _media;
    final PassportModel? current = _passport;
    if (media == null || current == null || _uploading != null || _isSaving) {
      return false;
    }

    _documentError = null;
    final PickedAttachment? file;
    try {
      file = await _pick(doc.extensions);
    } catch (_) {
      _documentError =
          'Không mở được trình chọn tệp. Hãy cấp quyền truy cập tệp rồi thử lại.';
      notifyListeners();
      return false;
    }
    if (file == null) return false;
    final String? invalid = doc.validate(file.name, file.bytes);
    if (invalid != null) {
      _documentError = invalid;
      notifyListeners();
      return false;
    }

    _uploading = doc;
    notifyListeners();
    final Result<String, Failure> uploaded = await media.upload(file,
        category: doc.category, mimeType: PassportDocument.mimeFor(file.name));
    final String? assetId = uploaded.dataOrNull;
    if (assetId == null) {
      _uploading = null;
      _documentError = uploaded.errorOrNull?.message ?? 'Tải tệp thất bại.';
      notifyListeners();
      return false;
    }

    final Result<PassportModel, Failure> saved =
        await _repository.updateMyPassport(
      PassportDraft.fromPassport(current),
      expectedVersion: current.profileVersion,
      assets: <String, String>{doc.field: assetId},
    );
    _uploading = null;
    final Failure? failure = saved.errorOrNull;
    if (failure == null) {
      _passport = saved.dataOrNull;
      notifyListeners();
      return true;
    }
    _documentError = failure.code == 'VERSION_MISMATCH'
        ? 'Hồ sơ vừa được cập nhật ở nơi khác. Đã tải lại, hãy tải tệp lên lần nữa.'
        : failure.message;
    if (failure.code == 'VERSION_MISMATCH') {
      _passport = (await _repository.getMyPassport()).dataOrNull ?? _passport;
    }
    notifyListeners();
    return false;
  }

  /// Direct upload from bytes (e.g. from ImagePicker camera or gallery).
  Future<bool> uploadDocumentFromBytes(
    PassportDocument doc, {
    required String fileName,
    required Uint8List bytes,
  }) async {
    final MediaRepository? media = _media;
    final PassportModel? current = _passport;
    if (media == null || current == null || _uploading != null || _isSaving) {
      return false;
    }

    _documentError = null;
    final String? invalid = doc.validate(fileName, bytes);
    if (invalid != null) {
      _documentError = invalid;
      notifyListeners();
      return false;
    }

    _uploading = doc;
    notifyListeners();

    if (doc == PassportDocument.avatar) {
      await saveLocalAvatar(bytes);
    }

    final PickedAttachment attachment =
        PickedAttachment(name: fileName, bytes: bytes);
    final Result<String, Failure> uploaded = await media.upload(
      attachment,
      category: doc.category,
      mimeType: PassportDocument.mimeFor(fileName),
    );

    final String? assetId = uploaded.dataOrNull;
    if (assetId == null) {
      _uploading = null;
      _documentError = uploaded.errorOrNull?.message ?? 'Tải tệp thất bại.';
      notifyListeners();
      return false;
    }

    final Result<PassportModel, Failure> saved =
        await _repository.updateMyPassport(
      PassportDraft.fromPassport(current),
      expectedVersion: current.profileVersion,
      assets: <String, String>{doc.field: assetId},
    );
    _uploading = null;
    final Failure? failure = saved.errorOrNull;
    if (failure == null) {
      _passport = saved.dataOrNull;
      notifyListeners();
      return true;
    }
    _documentError = failure.code == 'VERSION_MISMATCH'
        ? 'Hồ sơ vừa được cập nhật ở nơi khác. Đã tải lại, hãy tải tệp lên lần nữa.'
        : failure.message;
    if (failure.code == 'VERSION_MISMATCH') {
      _passport = (await _repository.getMyPassport()).dataOrNull ?? _passport;
    }
    notifyListeners();
    return false;
  }

  /// Autocomplete for the edit form (region, institution, major).
  Future<Result<List<ProfileSuggestion>, Failure>> suggest(
          String field, String query,
          {String? institution}) =>
      _repository.suggest(field, query, institution: institution);

  /// Reloads the Passport quietly (no spinner) and returns the CV with new 5-minute links.
  /// Leaves the cached copy alone while an upload or save is writing it.
  Future<FileLink?> freshCvLink() async {
    final PassportModel? p = (await _repository.getMyPassport()).dataOrNull;
    if (p == null) return null;
    if (_uploading == null && !_isSaving) {
      _passport = p;
      notifyListeners();
    }
    return p.cvFile;
  }

  Future<void> loadPassport() async {
    setLoading();

    final Result<PassportModel, Failure> result =
        await _repository.getMyPassport();

    result.fold<void>(
      onSuccess: (PassportModel data) {
        _passport = data;
        if (data.avatarUrl != null && data.avatarUrl!.isNotEmpty) {
          UserAvatarService.instance.setAvatarUrl(data.avatarUrl!);
        }
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  /// Saves the form. Returns true on success. On failure the caller keeps the draft
  /// so nothing the user typed is lost.
  Future<bool> save(PassportDraft draft) async {
    final PassportModel? current = _passport;
    if (current == null || _isSaving) return false;

    _isSaving = true;
    _saveError = null;
    _hadVersionConflict = false;
    notifyListeners();

    // FR-PROF-05: visibility is saved on its own endpoint first. It does not bump the profile
    // version, so the content update below still matches expectedVersion.
    if (_privacyChanged(current, draft)) {
      final Failure? privacyFailure =
          (await _repository.updateFieldPrivacy(draft)).errorOrNull;
      if (privacyFailure != null) {
        _isSaving = false;
        _saveError = 'Chưa lưu được quyền hiển thị: ${privacyFailure.message}';
        notifyListeners();
        return false;
      }
    }

    final Result<PassportModel, Failure> result = await _repository
        .updateMyPassport(draft, expectedVersion: current.profileVersion);

    _isSaving = false;
    final Failure? failure = result.errorOrNull;
    if (failure == null) {
      _passport = result.dataOrNull;
      notifyListeners();
      return true;
    }

    if (failure.code == 'VERSION_MISMATCH') {
      _hadVersionConflict = true;
      _saveError =
          'Hồ sơ vừa được cập nhật ở nơi khác. Dữ liệu mới đã được tải lại, '
          'hãy kiểm tra rồi lưu lại thay đổi của bạn.';
      final Result<PassportModel, Failure> fresh =
          await _repository.getMyPassport();
      _passport = fresh.dataOrNull ?? _passport;
    } else {
      _saveError = failure.message;
    }
    notifyListeners();
    return false;
  }

  static bool _privacyChanged(PassportModel current, PassportDraft draft) =>
      privacyFields.any((PrivacyFieldInfo f) =>
          current.visibilityOf(f.key) !=
          (draft.fieldPrivacy[f.key] ?? f.byDefault));

  void clearSaveError() {
    if (_saveError == null) return;
    _saveError = null;
    notifyListeners();
  }
}
