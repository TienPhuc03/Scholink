import 'dart:async';
import 'dart:convert';

import 'package:uuid/uuid.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'application_model.dart';
import 'application_repository.dart';
import 'attachment_model.dart';
import 'media_repository.dart';
import 'submission_store.dart';

/// Picks one file; abstracted so the view model can be tested without the plugin.
abstract interface class AttachmentPicker {
  Future<PickedAttachment?> pick();
}

enum ApplyStep { readiness, attachments, review }

/// F19: individual application in three steps on one screen (Q7):
/// readiness check → optional attachments → immutable preview + consent + submit.
class ApplyViewModel extends BaseViewModel {
  ApplyViewModel({
    required ApplicationRepository applications,
    required MediaRepository media,
    required SubmissionStore store,
    required AttachmentPicker picker,
    required this.opportunityId,
    required this.opportunityTitle,
    DateTime Function()? clock,
    String Function()? newId,
  })  : _applications = applications,
        _media = media,
        _store = store,
        _picker = picker,
        _clock = clock ?? DateTime.now,
        _newId = newId ?? (() => const Uuid().v4());

  final ApplicationRepository _applications;
  final MediaRepository _media;
  final SubmissionStore _store;
  final AttachmentPicker _picker;
  final DateTime Function() _clock;
  final String Function() _newId;

  final String opportunityId;
  final String opportunityTitle;

  ApplyStep _step = ApplyStep.readiness;
  ApplyStep get step => _step;

  // ---- Already applied (Q15) ----
  ApplicationSummary? _existing;
  ApplicationSummary? get existingApplication => _existing;

  /// Set when this flow resubmits a withdrawn application: the revision number it will become.
  int? _resubmitRevision;
  int? get resubmitRevision => _resubmitRevision;

  // ---- Step 1: readiness ----
  ReadinessResult? _readiness;
  ReadinessResult? get readiness => _readiness;
  bool _checkingReadiness = false;
  bool get checkingReadiness => _checkingReadiness;
  String? _readinessError;
  String? get readinessError => _readinessError;

  // ---- Step 2: attachments ----
  final List<AttachmentItem> _attachments = <AttachmentItem>[];
  List<AttachmentItem> get attachments => List<AttachmentItem>.unmodifiable(_attachments);
  String? _attachmentError;
  String? get attachmentError => _attachmentError;
  bool get isUploading => _attachments.any((AttachmentItem a) => a.state == AttachmentState.uploading);
  List<String> get _readyAssetIds => _attachments
      .where((AttachmentItem a) => a.state == AttachmentState.ready && a.assetId != null)
      .map((AttachmentItem a) => a.assetId!)
      .toList();

  // ---- Step 3: preview, consent, submit ----
  ApplicationPreview? _preview;
  ApplicationPreview? get preview => _preview;
  bool _creatingPreview = false;
  bool get creatingPreview => _creatingPreview;
  String? _previewError;
  String? get previewError => _previewError;

  /// Set when the backend says the preview/profile/consent no longer matches (Q9).
  bool _previewStale = false;
  bool get previewStale => _previewStale;

  Timer? _ticker;
  int get previewSecondsLeft {
    final ApplicationPreview? p = _preview;
    if (p == null) return 0;
    final int s = p.expiresAt.difference(_clock()).inSeconds;
    return s < 0 ? 0 : s;
  }

  bool get previewExpired => _preview != null && previewSecondsLeft <= 0;
  bool get needsNewPreview => _preview == null || previewExpired || _previewStale;

  bool _consentAccepted = false;
  bool get consentAccepted => _consentAccepted;
  ConsentReceipt? _consent;

  bool _submitting = false;
  bool get submitting => _submitting;
  String? _submitError;
  String? get submitError => _submitError;

  /// True when the last send may or may not have reached the server; retrying resends the
  /// same body and Idempotency-Key, so it can never create a second application.
  bool _canRetrySubmit = false;
  bool get canRetrySubmit => _canRetrySubmit;

  /// Deadline passed or opportunity closed: nothing the user can do in this flow.
  String? _terminalError;
  String? get terminalError => _terminalError;

  SubmitResult? _result;
  SubmitResult? get result => _result;

  PendingSubmission? _pending;

  /// A request from an earlier session (crash, app killed) whose answer never arrived.
  bool get hasUnconfirmedAttempt => _pending?.hasSentRequest == true && _result == null;

  bool get canSubmit =>
      _preview != null && !needsNewPreview && _consentAccepted && !_submitting && _terminalError == null;

  // ======================= Lifecycle =======================

  Future<void> start() async {
    setLoading();
    final Result<List<ApplicationSummary>, Failure> mine = await _applications.getMyApplications();
    _existing = _findActive(mine.dataOrNull);
    _resubmitRevision = _findResubmitRevision(mine.dataOrNull);
    _pending = await _store.load(opportunityId);
    setIdle();
    if (_existing == null) await checkReadiness();
  }

  ApplicationSummary? _findActive(List<ApplicationSummary>? items) {
    if (items == null) return null;
    for (final ApplicationSummary a in items) {
      if (a.opportunityId == opportunityId && !a.isTeam && a.status.isActive) return a;
    }
    return null;
  }

  /// F28 (Q4): the backend keeps one application per opportunity, so submitting after a
  /// withdrawal becomes the next revision of that same application.
  int? _findResubmitRevision(List<ApplicationSummary>? items) {
    if (items == null) return null;
    for (final ApplicationSummary a in items) {
      if (a.opportunityId == opportunityId && !a.isTeam && !a.status.isActive) return a.revision + 1;
    }
    return null;
  }

  // ======================= Step 1 =======================

  Future<void> checkReadiness() async {
    _checkingReadiness = true;
    _readinessError = null;
    notifyListeners();
    final Result<ReadinessResult, Failure> r = await _applications.checkReadiness(opportunityId);
    _checkingReadiness = false;
    _readiness = r.dataOrNull ?? _readiness;
    _readinessError = r.errorOrNull?.message;
    if (_readiness != null && _readiness!.profileVersion != _preview?.profileVersion) {
      // Passport changed since the preview was made: the old snapshot is no longer what we'd send.
      _invalidatePreview();
    }
    notifyListeners();
  }

  void goToAttachments() {
    if (_readiness?.canProceed != true) return;
    _step = ApplyStep.attachments;
    notifyListeners();
  }

  // ======================= Step 2 =======================

  Future<void> pickAttachment() async {
    _attachmentError = null;
    final PickedAttachment? file = await _picker.pick();
    if (file == null) {
      notifyListeners();
      return;
    }
    final String? invalid = AttachmentRules.validate(
      fileName: file.name,
      bytes: file.bytes,
      alreadyAttached: _attachments.where((AttachmentItem a) => a.state != AttachmentState.rejected).length,
    );
    if (invalid != null) {
      _attachmentError = '${file.name}: $invalid';
      notifyListeners();
      return;
    }

    final AttachmentItem item = AttachmentItem(
      localId: _newId(),
      fileName: file.name,
      sizeBytes: file.bytes.length,
      state: AttachmentState.uploading,
    );
    _attachments.add(item);
    _invalidatePreview();
    notifyListeners();

    final Result<String, Failure> uploaded = await _media.uploadAttachment(file);
    final int i = _attachments.indexWhere((AttachmentItem a) => a.localId == item.localId);
    if (i < 0) return; // removed while uploading
    _attachments[i] = uploaded.fold<AttachmentItem>(
      onSuccess: (String assetId) => item.copyWith(state: AttachmentState.ready, assetId: assetId),
      onFailure: (Failure f) => item.copyWith(state: AttachmentState.rejected, error: f.message),
    );
    notifyListeners();
  }

  void removeAttachment(String localId) {
    _attachments.removeWhere((AttachmentItem a) => a.localId == localId);
    _attachmentError = null;
    _invalidatePreview();
    notifyListeners();
  }

  Future<void> goToReview() async {
    if (isUploading) {
      _attachmentError = 'Vui lòng đợi tệp tải lên xong.';
      notifyListeners();
      return;
    }
    _step = ApplyStep.review;
    notifyListeners();
    if (_preview == null) await createPreview();
  }

  void back() {
    if (_submitting) return;
    _step = switch (_step) {
      ApplyStep.review => ApplyStep.attachments,
      _ => ApplyStep.readiness,
    };
    notifyListeners();
  }

  // ======================= Step 3 =======================

  void _invalidatePreview() {
    _preview = null;
    _consent = null;
    _consentAccepted = false;
    _previewStale = false;
    _ticker?.cancel();
  }

  Future<void> _ensurePending() async {
    if (_pending != null) return;
    _pending = PendingSubmission(opportunityId: opportunityId, submissionId: _newId(), createdAt: _clock());
    await _store.save(_pending!);
  }

  /// Q9: only ever created on the user's request; a new preview always needs a fresh consent.
  Future<void> createPreview() async {
    if (_creatingPreview || _readiness == null) return;
    _creatingPreview = true;
    _previewError = null;
    _submitError = null;
    _canRetrySubmit = false;
    _invalidatePreview();
    notifyListeners();

    await _ensurePending();
    final Result<ApplicationPreview, Failure> r = await _applications.createPreview(
      opportunityId: opportunityId,
      submissionId: _pending!.submissionId,
      expectedRuleVersion: _readiness!.ruleVersion,
      attachmentIds: _readyAssetIds,
    );
    _creatingPreview = false;
    r.fold<void>(
      onSuccess: (ApplicationPreview p) {
        _preview = p;
        _ticker = Timer.periodic(const Duration(seconds: 1), (Timer t) {
          if (previewExpired) t.cancel();
          notifyListeners();
        });
      },
      onFailure: (Failure f) => _handleFlowFailure(f, isPreview: true),
    );
    notifyListeners();
  }

  void setConsent(bool accepted) {
    _consentAccepted = accepted;
    notifyListeners();
  }

  Future<void> submit() async {
    if (!canSubmit) return;
    final ApplicationPreview preview = _preview!;
    _submitting = true;
    _submitError = null;
    _canRetrySubmit = false;
    notifyListeners();

    if (_consent?.previewId != preview.previewId) {
      final Result<ConsentReceipt, Failure> c = await _applications.createConsent(preview);
      final Failure? consentError = c.errorOrNull;
      if (consentError != null) {
        _submitting = false;
        _handleFlowFailure(consentError);
        notifyListeners();
        return;
      }
      _consent = c.dataOrNull;
    }

    final Map<String, dynamic> body = ApplicationRepository.buildSubmitBody(preview, _consent!);
    await _ensurePending();
    final PendingSubmission p = _pending!;
    final bool sameRequest = p.hasSentRequest && jsonEncode(p.body) == jsonEncode(body);
    _pending = sameRequest ? p : p.withRequest(idempotencyKey: _newId(), body: body);
    // Persist before sending: if the app dies mid-request we can resend the identical request.
    await _store.save(_pending!);
    await _send();
  }

  /// Resends the stored request unchanged (same body, same Idempotency-Key).
  Future<void> retrySubmit() async {
    if (_pending?.hasSentRequest != true || _submitting) return;
    _submitting = true;
    _submitError = null;
    _canRetrySubmit = false;
    notifyListeners();
    await _send();
  }

  Future<void> _send() async {
    final PendingSubmission p = _pending!;
    final Result<SubmitResult, Failure> r = await _applications.submit(body: p.body!, idempotencyKey: p.idempotencyKey!);
    _submitting = false;
    final SubmitResult? ok = r.dataOrNull;
    if (ok != null) {
      _result = ok;
      _pending = null;
      await _store.clear(opportunityId);
      _ticker?.cancel();
      notifyListeners();
      return;
    }
    await _handleSubmitFailure(r.errorOrNull!);
    notifyListeners();
  }

  Future<void> _handleSubmitFailure(Failure f) async {
    final int? status = f is ServerFailure ? f.statusCode : null;
    final bool transient = f is NetworkFailure ||
        f.code == 'REQUEST_IN_PROGRESS' ||
        f.code == 'NETWORK_ERROR' ||
        (status != null && status >= 500);
    if (transient) {
      _canRetrySubmit = true;
      _submitError = f.code == 'REQUEST_IN_PROGRESS'
          ? 'Hồ sơ đang được xử lý. Vui lòng bấm "Thử lại" sau vài giây.'
          : 'Chưa nhận được xác nhận từ máy chủ. Bấm "Thử lại" để gửi lại đúng yêu cầu này, '
              'Scholink sẽ không tạo hồ sơ trùng.';
      return;
    }
    if (f.code == 'ALREADY_APPLIED') {
      _pending = null;
      await _store.clear(opportunityId);
      final Result<List<ApplicationSummary>, Failure> mine = await _applications.getMyApplications();
      _existing = _findActive(mine.dataOrNull);
      _submitError = f.message;
      return;
    }
    if (f.code == 'IDEMPOTENCY_CONFLICT') {
      // Stored key belongs to another body; the next submit will mint a new key.
      _pending = PendingSubmission(
        opportunityId: opportunityId,
        submissionId: _pending!.submissionId,
        createdAt: _pending!.createdAt,
      );
      await _store.save(_pending!);
    }
    _handleFlowFailure(f);
  }

  /// Shared mapping for preview/consent/submit errors (opportunity & identity error codes).
  void _handleFlowFailure(Failure f, {bool isPreview = false}) {
    switch (f.code) {
      case 'PREVIEW_EXPIRED':
      case 'VERSION_MISMATCH':
      case 'CONSENT_MISMATCH':
      case 'IDEMPOTENCY_CONFLICT':
        _previewStale = true;
        _consentAccepted = false;
        _submitError = '${f.message} Hãy tạo lại bản xem trước và xác nhận lại.';
      case 'PROFILE_INCOMPLETE':
        _invalidatePreview();
        _step = ApplyStep.readiness;
        _readinessError = f.message;
        unawaited(checkReadiness());
      case 'DEADLINE_PASSED':
      case 'STATE_CONFLICT':
        _terminalError = f.message;
      default:
        if (isPreview) {
          _previewError = f.message;
        } else {
          _submitError = f.message;
        }
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }
}
