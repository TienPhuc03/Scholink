import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Central singleton service that manages and synchronizes the current user's avatar
/// in real-time across all screens (Trang chủ, Passport, Teams, Chat, etc.).
class UserAvatarService extends ChangeNotifier {
  static final UserAvatarService instance = UserAvatarService._internal();

  UserAvatarService._internal() {
    loadAvatar();
  }

  Uint8List? _avatarBytes;
  String? _avatarUrl;

  Uint8List? get avatarBytes => _avatarBytes;
  String? get avatarUrl => _avatarUrl;
  bool get hasAvatar =>
      _avatarBytes != null || (_avatarUrl != null && _avatarUrl!.isNotEmpty);

  static const String _prefKeyB64 = 'scholink_user_avatar_b64';
  static const String _prefKeyUrl = 'scholink_user_avatar_url';

  Future<void> loadAvatar() async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      final String? b64 = prefs.getString(_prefKeyB64);
      if (b64 != null && b64.isNotEmpty) {
        _avatarBytes = base64Decode(b64);
      }
      _avatarUrl = prefs.getString(_prefKeyUrl);
      notifyListeners();
    } catch (_) {}
  }

  Future<void> setAvatarBytes(Uint8List bytes, {String? url}) async {
    _avatarBytes = bytes;
    if (url != null && url.isNotEmpty) _avatarUrl = url;
    notifyListeners();
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKeyB64, base64Encode(bytes));
      if (url != null && url.isNotEmpty) {
        await prefs.setString(_prefKeyUrl, url);
      }
    } catch (_) {}
  }

  Future<void> setAvatarUrl(String url) async {
    _avatarUrl = url;
    notifyListeners();
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKeyUrl, url);
    } catch (_) {}
  }

  Future<void> clear() async {
    _avatarBytes = null;
    _avatarUrl = null;
    notifyListeners();
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefKeyB64);
      await prefs.remove(_prefKeyUrl);
    } catch (_) {}
  }
}
