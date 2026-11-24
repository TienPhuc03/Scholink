import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Khởi tạo Firebase; false khi chưa cấu hình (app vẫn chạy, chỉ thiếu Analytics,
/// Performance và FCM). Analytics và Performance tự thu thập sau bước này.
Future<bool> initFirebase() async {
  try {
    await Firebase.initializeApp();
    return true;
  } catch (e) {
    debugPrint('[Firebase] Không khởi tạo được: $e');
    return false;
  }
}
