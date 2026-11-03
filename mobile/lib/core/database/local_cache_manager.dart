import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Contract for offline caching of opportunities, profiles, and cached states.
abstract interface class LocalCacheManager {
  Future<void> saveString(String key, String value);
  Future<String?> getString(String key);
  Future<void> saveJson(String key, dynamic data);
  Future<dynamic> getJson(String key);
  Future<void> remove(String key);
  Future<void> clear();
}

/// Concrete implementation of LocalCacheManager backed by SharedPreferences.
class SharedPreferencesCacheManager implements LocalCacheManager {
  final SharedPreferences _prefs;

  SharedPreferencesCacheManager(this._prefs);

  static Future<SharedPreferencesCacheManager> create() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    return SharedPreferencesCacheManager(prefs);
  }

  @override
  Future<void> saveString(String key, String value) async {
    await _prefs.setString(key, value);
  }

  @override
  Future<String?> getString(String key) async {
    return _prefs.getString(key);
  }

  @override
  Future<void> saveJson(String key, dynamic data) async {
    final String encoded = jsonEncode(data);
    await _prefs.setString(key, encoded);
  }

  @override
  Future<dynamic> getJson(String key) async {
    final String? raw = _prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;
    try {
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> remove(String key) async {
    await _prefs.remove(key);
  }

  @override
  Future<void> clear() async {
    await _prefs.clear();
  }
}
