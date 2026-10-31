import 'package:flutter/foundation.dart';

/// Standard UI state enum for MVVM pattern.
enum ViewState {
  idle,
  loading,
  success,
  error,
}

/// Abstract base ViewModel implementing ChangeNotifier for MVVM state management.
abstract class BaseViewModel extends ChangeNotifier {
  ViewState _state = ViewState.idle;
  String? _errorMessage;
  bool _disposed = false;

  ViewState get state => _state;
  bool get isLoading => _state == ViewState.loading;
  bool get isSuccess => _state == ViewState.success;
  bool get hasError => _state == ViewState.error;
  String? get errorMessage => _errorMessage;

  @protected
  void setState(ViewState viewState, {String? errorMessage}) {
    if (_disposed) return;
    _state = viewState;
    _errorMessage = errorMessage;
    notifyListeners();
  }

  @protected
  void setLoading() {
    setState(ViewState.loading);
  }

  @protected
  void setSuccess() {
    setState(ViewState.success);
  }

  @protected
  void setError(String message) {
    setState(ViewState.error, errorMessage: message);
  }

  @protected
  void setIdle() {
    setState(ViewState.idle);
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
