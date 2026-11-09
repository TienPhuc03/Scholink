import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'passport_model.dart';
import 'passport_repository.dart';

/// ViewModel managing state and operations for Passport in MVVM architecture.
class PassportViewModel extends BaseViewModel {
  final PassportRepository _repository;

  PassportModel? _passport;
  PassportModel? get passport => _passport;

  bool _isSaving = false;
  bool get isSaving => _isSaving;

  String? _saveError;
  String? get saveError => _saveError;

  /// True after a 409 VERSION_MISMATCH: the Passport was changed elsewhere and has been reloaded.
  bool _hadVersionConflict = false;
  bool get hadVersionConflict => _hadVersionConflict;

  PassportViewModel(this._repository);

  Future<void> loadPassport() async {
    setLoading();

    final Result<PassportModel, Failure> result = await _repository.getMyPassport();

    result.fold<void>(
      onSuccess: (PassportModel data) {
        _passport = data;
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
      final Failure? privacyFailure = (await _repository.updateFieldPrivacy(draft)).errorOrNull;
      if (privacyFailure != null) {
        _isSaving = false;
        _saveError = 'Chưa lưu được quyền hiển thị: ${privacyFailure.message}';
        notifyListeners();
        return false;
      }
    }

    final Result<PassportModel, Failure> result =
        await _repository.updateMyPassport(draft, expectedVersion: current.profileVersion);

    _isSaving = false;
    final Failure? failure = result.errorOrNull;
    if (failure == null) {
      _passport = result.dataOrNull;
      notifyListeners();
      return true;
    }

    if (failure.code == 'VERSION_MISMATCH') {
      _hadVersionConflict = true;
      _saveError = 'Hồ sơ vừa được cập nhật ở nơi khác. Dữ liệu mới đã được tải lại, '
          'hãy kiểm tra rồi lưu lại thay đổi của bạn.';
      final Result<PassportModel, Failure> fresh = await _repository.getMyPassport();
      _passport = fresh.dataOrNull ?? _passport;
    } else {
      _saveError = failure.message;
    }
    notifyListeners();
    return false;
  }

  static bool _privacyChanged(PassportModel current, PassportDraft draft) => privacyFields
      .any((PrivacyFieldInfo f) => current.visibilityOf(f.key) != (draft.fieldPrivacy[f.key] ?? f.byDefault));

  void clearSaveError() {
    if (_saveError == null) return;
    _saveError = null;
    notifyListeners();
  }
}
