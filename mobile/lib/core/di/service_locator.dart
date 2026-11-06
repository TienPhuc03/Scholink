import 'package:get_it/get_it.dart';

// Core Infrastructure
import '../database/local_cache_manager.dart';
import '../database/room_database.dart';
import '../network/api_client.dart';
import '../realtime/mqtt_manager.dart';
import '../storage/secure_storage_helper.dart';

// Feature 1: Auth
import '../../features/auth/auth_repository.dart';
import '../../features/auth/email_verification_viewmodel.dart';
import '../../features/auth/login_viewmodel.dart';
import '../../features/auth/password_reset_viewmodel.dart';
import '../../features/auth/register_viewmodel.dart';

// Feature 2: Opportunity (Tuần 1 - F02 & Tuần 2 - F11)
import '../../features/opportunity/opportunity_repository.dart';
import '../../features/opportunity/opportunity_viewmodel.dart';

// Feature 3: Team
import '../../features/team/team_repository.dart';
import '../../features/team/team_viewmodel.dart';

// Feature 4: Chat
import '../../features/chat/chat_repository.dart';
import '../../features/chat/chat_viewmodel.dart';

// Feature 5: Passport
import '../../features/passport/passport_repository.dart';
import '../../features/passport/passport_viewmodel.dart';

// Feature 6: Notification & Calendar Sync (Tuần 3 - F20)
import '../../features/notification/notification_repository.dart';
import '../../features/notification/notification_viewmodel.dart';

final GetIt sl = GetIt.instance;

/// Centralized Dependency Injection setup for MVVM + Repository pattern.
Future<void> setupServiceLocator() async {
  // 1. Core Infrastructure Singletons
  final SecureStorageHelper secureStorage = SecureStorageHelperImpl();
  sl.registerSingleton<SecureStorageHelper>(secureStorage);

  final LocalCacheManager localCache = await SharedPreferencesCacheManager.create();
  sl.registerSingleton<LocalCacheManager>(localCache);

  // Room Database for structured table schemas and offline caching
  final RoomDatabase roomDb = RoomDatabaseImpl(localCache);
  sl.registerSingleton<RoomDatabase>(roomDb);

  final ApiClient apiClient = DioApiClient(secureStorage: secureStorage);
  sl.registerSingleton<ApiClient>(apiClient);

  final MqttManager mqttManager = MqttManagerImpl();
  sl.registerSingleton<MqttManager>(mqttManager);

  // 2. Feature Repositories (Lazy Singletons)
  sl.registerLazySingleton<AuthRepository>(
    () => AuthRepository(
      apiClient: sl<ApiClient>(),
      secureStorage: sl<SecureStorageHelper>(),
    ),
  );

  sl.registerLazySingleton<OpportunityRepository>(
    () => OpportunityRepository(
      apiClient: sl<ApiClient>(),
      roomDb: sl<RoomDatabase>(),
      localCache: sl<LocalCacheManager>(),
    ),
  );

  sl.registerLazySingleton<TeamRepository>(
    () => TeamRepository(sl<ApiClient>()),
  );

  sl.registerLazySingleton<ChatRepository>(
    () => ChatRepository(sl<ApiClient>()),
  );

  sl.registerLazySingleton<PassportRepository>(
    () => PassportRepository(sl<ApiClient>()),
  );

  sl.registerLazySingleton<NotificationRepository>(
    () => NotificationRepository(
      apiClient: sl<ApiClient>(),
      roomDb: sl<RoomDatabase>(),
    ),
  );

  // 3. Feature ViewModels (Factory instances for Views)
  sl.registerFactory<LoginViewModel>(
    () => LoginViewModel(sl<AuthRepository>()),
  );

  // F10: register, email OTP verification and password reset flows
  sl.registerFactory<RegisterViewModel>(
    () => RegisterViewModel(sl<AuthRepository>()),
  );

  sl.registerFactory<EmailVerificationViewModel>(
    () => EmailVerificationViewModel(sl<AuthRepository>()),
  );

  sl.registerFactory<PasswordResetViewModel>(
    () => PasswordResetViewModel(sl<AuthRepository>()),
  );

  sl.registerFactory<OpportunityViewModel>(
    () => OpportunityViewModel(sl<OpportunityRepository>()),
  );

  sl.registerFactory<TeamViewModel>(
    () => TeamViewModel(
      repository: sl<TeamRepository>(),
      secureStorage: sl<SecureStorageHelper>(),
    ),
  );

  sl.registerFactory<ChatViewModel>(
    () => ChatViewModel(
      repository: sl<ChatRepository>(),
      mqttManager: sl<MqttManager>(),
      secureStorage: sl<SecureStorageHelper>(),
    ),
  );

  sl.registerFactory<PassportViewModel>(
    () => PassportViewModel(sl<PassportRepository>()),
  );

  sl.registerFactory<NotificationViewModel>(
    () => NotificationViewModel(sl<NotificationRepository>()),
  );
}
