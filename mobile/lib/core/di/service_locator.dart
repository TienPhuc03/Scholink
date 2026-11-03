import 'package:get_it/get_it.dart';

// Core Infrastructure
import '../database/local_cache_manager.dart';
import '../network/api_client.dart';
import '../realtime/mqtt_manager.dart';
import '../storage/secure_storage_helper.dart';

// Feature 1: Auth
import '../../features/auth/auth_repository.dart';
import '../../features/auth/login_viewmodel.dart';

// Feature 2: Opportunity
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

final GetIt sl = GetIt.instance;

/// Simple Dependency Injection setup for MVVM + Repository pattern.
Future<void> setupServiceLocator() async {
  // 1. Core Infrastructure Singletons
  final SecureStorageHelper secureStorage = SecureStorageHelperImpl();
  sl.registerSingleton<SecureStorageHelper>(secureStorage);

  final LocalCacheManager localCache = await SharedPreferencesCacheManager.create();
  sl.registerSingleton<LocalCacheManager>(localCache);

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

  // 3. Feature ViewModels (Factory instances for Views)
  sl.registerFactory<LoginViewModel>(
    () => LoginViewModel(sl<AuthRepository>()),
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
}
