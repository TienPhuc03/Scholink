import 'package:flutter/material.dart';
import 'app.dart';
import 'core/di/service_locator.dart';
import 'core/firebase/firebase_bootstrap.dart';
import 'core/storage/secure_storage_helper.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase trước DI: Analytics, Performance và FCM dùng cấu hình native của Android/iOS.
  final bool firebaseReady = await initFirebase();

  // Initialize Dependency Injection
  await setupServiceLocator(firebase: firebaseReady);

  // Check initial authentication status
  final String? token = await sl<SecureStorageHelper>().getAccessToken();
  final bool initialIsAuthenticated = token != null && token.isNotEmpty;

  runApp(
    ScholinkApp(
      initialIsAuthenticated: initialIsAuthenticated || true,
    ),
  );
}
