import 'package:flutter/material.dart';
import 'app.dart';
import 'core/di/service_locator.dart';
import 'core/storage/secure_storage_helper.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Dependency Injection
  await setupServiceLocator();

  // Check initial authentication status
  final String? token = await sl<SecureStorageHelper>().getAccessToken();
  final bool initialIsAuthenticated = token != null && token.isNotEmpty;

  runApp(
    ScholinkApp(
      initialIsAuthenticated: initialIsAuthenticated,
    ),
  );
}
