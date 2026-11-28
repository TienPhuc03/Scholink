import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'device_services.dart';

/// iOS side of [NotificationPermission] and [LocalNotifier]. The `com.scholink.app/device`
/// channel only exists on Android (MainActivity.kt), so on iPhone the permission dialog never
/// appeared and MQTT pushes were never shown. Calendar sync stays Android-only.
class IosLocalNotifications implements NotificationPermission, LocalNotifier {
  final FlutterLocalNotificationsPlugin _plugin;
  Future<void>? _ready;
  String? _tappedRefUrl;

  IosLocalNotifications([FlutterLocalNotificationsPlugin? plugin])
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  IOSFlutterLocalNotificationsPlugin? get _ios => _plugin
      .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();

  Future<void> _init() => _ready ??= () async {
        await _plugin.initialize(
          // No dialog at start-up: [request] asks after login.
          settings: const InitializationSettings(
            iOS: DarwinInitializationSettings(
              requestAlertPermission: false,
              requestSoundPermission: false,
              requestBadgePermission: false,
            ),
          ),
          onDidReceiveNotificationResponse: (NotificationResponse r) =>
              _tappedRefUrl = r.payload,
        );
        final NotificationAppLaunchDetails? launch =
            await _plugin.getNotificationAppLaunchDetails();
        if (launch?.didNotificationLaunchApp ?? false) {
          _tappedRefUrl = launch!.notificationResponse?.payload;
        }
      }();

  @override
  Future<bool> isGranted() async {
    await _init();
    return (await _ios?.checkPermissions())?.isEnabled ?? false;
  }

  @override
  Future<bool> request() async {
    await _init();
    return await _ios?.requestPermissions(
            alert: true, sound: true, badge: true) ??
        false;
  }

  @override
  Future<bool> show(
      {required String id,
      required String title,
      required String body,
      String? refUrl}) async {
    if (!await isGranted()) return false;
    await _plugin.show(
      id: id.hashCode & 0x7fffffff,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(
        iOS: DarwinNotificationDetails(
            presentAlert: true, presentBanner: true, presentSound: true),
      ),
      payload: refUrl,
    );
    return true;
  }

  @override
  Future<String?> takeLaunchRefUrl() async {
    await _init();
    final String? ref = _tappedRefUrl;
    _tappedRefUrl = null;
    return (ref == null || ref.isEmpty) ? null : ref;
  }
}
