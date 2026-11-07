import 'package:get_it/get_it.dart';

// Core Infrastructure
import '../database/local_cache_manager.dart';
import '../database/room_database.dart';
import '../network/session_events.dart';
import '../network/api_client.dart';
import '../realtime/mqtt_manager.dart';
import '../storage/secure_storage_helper.dart';

// Feature: Application (F19)
import '../../features/application/application_repository.dart';
import '../../features/application/apply_viewmodel.dart';
import '../../features/application/file_attachment_picker.dart';
import '../../features/application/media_repository.dart';
import '../../features/application/submission_store.dart';

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
  final SecureStorageHelper secureStorage = SecureStorageHelperImpl();
  final SessionEvents sessionEvents = SessionEvents();
  registerDependencies(
    secureStorage: secureStorage,
    localCache: await SharedPreferencesCacheManager.create(),
    sessionEvents: sessionEvents,
    apiClient: DioApiClient(secureStorage: secureStorage, sessionEvents: sessionEvents),
    mqttManager: MqttManagerImpl(),
    attachmentPicker: FileAttachmentPicker(),
  );
}

/// Registers every dependency from the given infrastructure. Widget tests of the whole app
/// call this with in-memory fakes (F37 multi-account checks).
void registerDependencies({
  required SecureStorageHelper secureStorage,
  required LocalCacheManager localCache,
  required SessionEvents sessionEvents,
  required ApiClient apiClient,
  required MqttManager mqttManager,
  required AttachmentPicker attachmentPicker,
}) {
  // 1. Core Infrastructure Singletons
  sl.registerSingleton<SecureStorageHelper>(secureStorage);
  sl.registerSingleton<LocalCacheManager>(localCache);

  // Room Database for structured table schemas and offline caching
  final RoomDatabase roomDb = RoomDatabaseImpl(localCache);
  sl.registerSingleton<RoomDatabase>(roomDb);

  sl.registerSingleton<SessionEvents>(sessionEvents);
  sl.registerSingleton<ApiClient>(apiClient);
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

  // F19: individual application flow (view models are built per screen in app.dart)
  sl.registerLazySingleton<ApplicationRepository>(
    () => ApplicationRepository(sl<ApiClient>()),
  );

  sl.registerLazySingleton<MediaRepository>(
    () => MediaRepository(sl<ApiClient>()),
  );

  sl.registerLazySingleton<SubmissionStore>(
    () => SubmissionStore(sl<LocalCacheManager>(), currentUserId: sl<SecureStorageHelper>().getUserId),
  );

  sl.registerSingleton<AttachmentPicker>(attachmentPicker);

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
