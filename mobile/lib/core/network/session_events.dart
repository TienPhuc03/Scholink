import 'dart:async';

/// App-wide signal that the signed-in session is gone: the refresh token was rejected or is
/// missing while an authenticated request got 401. The app shell listens and returns to the
/// login screen (F28, Q10); the network layer only reports it.
class SessionEvents {
  final StreamController<void> _expired = StreamController<void>.broadcast();

  Stream<void> get expired => _expired.stream;

  void notifyExpired() {
    if (!_expired.isClosed) _expired.add(null);
  }

  Future<void> dispose() => _expired.close();
}
