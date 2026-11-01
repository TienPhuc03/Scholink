import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Contract for secure local token and credential storage.
abstract interface class SecureStorageHelper {
  Future<String?> getAccessToken();
  Future<String?> getRefreshToken();
  Future<String?> getUserId();
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    String? userId,
  });
  Future<void> clear();
}

/// Concrete implementation using Android Keystore & iOS Keychain via flutter_secure_storage.
class SecureStorageHelperImpl implements SecureStorageHelper {
  final FlutterSecureStorage _storage;

  static const String _keyAccessToken = 'scholink_access_token';
  static const String _keyRefreshToken = 'scholink_refresh_token';
  static const String _keyUserId = 'scholink_user_id';

  SecureStorageHelperImpl({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                encryptedSharedPreferences: true,
                resetOnError: true,
              ),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  @override
  Future<String?> getAccessToken() async {
    try {
      return await _storage.read(key: _keyAccessToken);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<String?> getRefreshToken() async {
    try {
      return await _storage.read(key: _keyRefreshToken);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<String?> getUserId() async {
    try {
      return await _storage.read(key: _keyUserId);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    String? userId,
  }) async {
    await _storage.write(key: _keyAccessToken, value: accessToken);
    await _storage.write(key: _keyRefreshToken, value: refreshToken);
    if (userId != null) {
      await _storage.write(key: _keyUserId, value: userId);
    }
  }

  @override
  Future<void> clear() async {
    try {
      await _storage.deleteAll();
    } catch (_) {}
  }
}
