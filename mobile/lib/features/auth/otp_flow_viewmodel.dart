import 'dart:async';

import 'package:flutter/foundation.dart';
import '../../core/errors/failures.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'auth_model.dart';

/// Shared OTP state for email verification and password reset:
/// resend cooldown countdown, 15-minute lock after 5 wrong codes, expiry notice
/// and the dev-only OTP preview echoed by a non-production backend.
abstract class OtpFlowViewModel extends BaseViewModel {
  OtpFlowViewModel({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  Timer? _ticker;

  String _email = '';
  String get email => _email;

  int _resendSecondsLeft = 0;
  int get resendSecondsLeft => _resendSecondsLeft;

  DateTime? _lockedUntil;
  bool get isLocked => _lockedUntil != null && _clock().isBefore(_lockedUntil!);
  int get lockMinutesLeft =>
      isLocked ? (_lockedUntil!.difference(_clock()).inSeconds / 60).ceil() : 0;

  bool _isExpired = false;
  bool get isExpired => _isExpired;

  bool _isResending = false;
  bool get isResending => _isResending;

  /// Error tied to the code the user typed (wrong / expired / locked), shown under the boxes.
  bool _codeRejected = false;
  bool get codeRejected => _codeRejected;

  String? _notice;
  String? get notice => _notice;

  String? _devOtpPreview;

  /// Only surfaced in debug builds, so release APKs never show it.
  String? get devOtpHint => kDebugMode ? _devOtpPreview : null;

  @protected
  void startWithTicket(String email, OtpTicket? ticket, {String? initialError}) {
    _email = email;
    if (ticket != null) {
      _applyTicket(ticket);
    } else {
      _resendSecondsLeft = 0;
    }
    if (initialError != null) {
      _notice = null;
      setError(initialError);
    } else {
      notifyListeners();
    }
  }

  void _applyTicket(OtpTicket ticket) {
    _email = ticket.email;
    _devOtpPreview = ticket.devOtpPreview;
    _isExpired = false;
    _codeRejected = false;
    _notice = 'Mã gồm 6 chữ số, có hiệu lực ${(ticket.expiresInSeconds / 60).round()} phút.';
    _startCooldown(ticket.cooldownSeconds);
  }

  void _startCooldown(int seconds) {
    _ticker?.cancel();
    _resendSecondsLeft = seconds;
    if (seconds <= 0) return;
    _ticker = Timer.periodic(const Duration(seconds: 1), (Timer t) {
      _resendSecondsLeft = _resendSecondsLeft > 0 ? _resendSecondsLeft - 1 : 0;
      if (_resendSecondsLeft == 0) t.cancel();
      notifyListeners();
    });
  }

  /// Subclasses request a fresh OTP from the right endpoint.
  @protected
  Future<({OtpTicket? ticket, Failure? failure})> requestOtp();

  Future<void> resend() async {
    if (_resendSecondsLeft > 0 || _isResending || isLocked) return;
    _isResending = true;
    notifyListeners();
    final ({OtpTicket? ticket, Failure? failure}) result = await requestOtp();
    _isResending = false;
    if (result.ticket != null) {
      _applyTicket(result.ticket!);
      setIdle();
    } else if (result.failure != null) {
      handleOtpFailure(result.failure!);
    }
  }

  /// Maps backend OTP error codes (domain.exception.ts) to screen state.
  @protected
  void handleOtpFailure(Failure failure) {
    switch (failure.code) {
      case 'OTP_LOCKED':
        _lockedUntil = _clock().add(const Duration(minutes: 15));
        _codeRejected = true;
      case 'OTP_EXPIRED':
        _isExpired = true;
        _codeRejected = true;
      case 'OTP_INVALID':
        _codeRejected = true;
      case 'RATE_LIMITED':
      case 'OTP_COOLDOWN':
        final RegExpMatch? m = RegExp(r'(\d+)\s*giây').firstMatch(failure.message);
        _startCooldown(int.tryParse(m?.group(1) ?? '') ?? 60);
      default:
        break;
    }
    _notice = null;
    setError(failure.message);
  }

  /// Called when the user edits the code after an error.
  void clearCodeError() {
    if (!_codeRejected && !hasError) return;
    _codeRejected = false;
    setIdle();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }
}
