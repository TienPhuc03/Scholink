import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The signed-in user's avatar, shared by every screen that shows it.
///
/// Held in memory for the current session only: the server's Passport `avatarUrl` is the
/// source of truth, and [clear] runs on login/logout. It used to be stored per device, so the
/// next account on the same phone showed the previous account's photo.
class UserAvatarService extends ChangeNotifier {
  static final UserAvatarService instance = UserAvatarService._internal();

  UserAvatarService._internal() {
    _dropLegacyDeviceCache();
  }

  Uint8List? _avatarBytes;
  String? _avatarUrl;

  Uint8List? get avatarBytes => _avatarBytes;
  String? get avatarUrl => _avatarUrl;
  bool get hasAvatar =>
      _avatarBytes != null || (_avatarUrl != null && _avatarUrl!.isNotEmpty);

  /// Instant preview of a photo that is still uploading.
  void setAvatarBytes(Uint8List bytes) {
    _avatarBytes = bytes;
    notifyListeners();
  }

  /// The account's avatar as the server has it; null or empty means no avatar.
  void setFromServer(String? url) {
    _avatarBytes = null;
    _avatarUrl = (url == null || url.isEmpty) ? null : url;
    notifyListeners();
  }

  void clear() => setFromServer(null);

  /// Older builds kept one avatar per device; remove it so no account sees it again.
  Future<void> _dropLegacyDeviceCache() async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.remove('scholink_user_avatar_b64');
      await prefs.remove('scholink_user_avatar_url');
    } catch (_) {}
  }
}
