import 'package:get_it/get_it.dart';
import '../../features/auth/data/datasources/auth_remote_data_source.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/login_usecase.dart';
import '../../features/auth/presentation/viewmodels/login_viewmodel.dart';
import '../../features/chat/data/datasources/chat_remote_data_source.dart';
import '../../features/chat/data/repositories/chat_repository_impl.dart';
import '../../features/chat/domain/repositories/chat_repository.dart';
import '../../features/chat/domain/usecases/chat_usecases.dart';
import '../../features/chat/presentation/viewmodels/chat_viewmodel.dart';
import '../../features/opportunity/data/datasources/opportunity_local_data_source.dart';
import '../../features/opportunity/data/datasources/opportunity_remote_data_source.dart';
import '../../features/opportunity/data/repositories/opportunity_repository_impl.dart';
import '../../features/opportunity/domain/repositories/opportunity_repository.dart';
import '../../features/opportunity/domain/usecases/get_opportunities_usecase.dart';
import '../../features/opportunity/presentation/viewmodels/opportunity_viewmodel.dart';
import '../../features/passport/data/datasources/passport_remote_data_source.dart';
import '../../features/passport/data/repositories/passport_repository_impl.dart';
import '../../features/passport/domain/repositories/passport_repository.dart';
import '../../features/passport/domain/usecases/get_passport_usecase.dart';
import '../../features/passport/presentation/viewmodels/passport_viewmodel.dart';
import '../../features/team/data/datasources/team_remote_data_source.dart';
import '../../features/team/data/repositories/team_repository_impl.dart';
import '../../features/team/domain/repositories/team_repository.dart';
import '../../features/team/domain/usecases/team_usecases.dart';
import '../../features/team/presentation/viewmodels/team_viewmodel.dart';
import '../database/local_cache_manager.dart';
import '../network/api_client.dart';
import '../realtime/mqtt_manager.dart';
import '../storage/secure_storage_helper.dart';

final GetIt sl = GetIt.instance;

Future<void> setupServiceLocator() async {
  // Core Infrastructure
  final SecureStorageHelper secureStorage = SecureStorageHelperImpl();
  sl.registerSingleton<SecureStorageHelper>(secureStorage);

  final LocalCacheManager localCache = await SharedPreferencesCacheManager.create();
  sl.registerSingleton<LocalCacheManager>(localCache);

  final ApiClient apiClient = DioApiClient(secureStorage: secureStorage);
  sl.registerSingleton<ApiClient>(apiClient);

  final MqttManager mqttManager = MqttManagerImpl();
  sl.registerSingleton<MqttManager>(mqttManager);

  // Feature 1: Auth
  sl.registerLazySingleton<AuthRemoteDataSource>(
    () => AuthRemoteDataSourceImpl(sl<ApiClient>()),
  );
  sl.registerLazySingleton<AuthRepository>(
    () => AuthRepositoryImpl(
      remoteDataSource: sl<AuthRemoteDataSource>(),
      secureStorage: sl<SecureStorageHelper>(),
    ),
  );
  sl.registerLazySingleton<LoginUseCase>(() => LoginUseCase(sl<AuthRepository>()));
  sl.registerFactory<LoginViewModel>(() => LoginViewModel(sl<LoginUseCase>()));

  // Feature 2: Passport
  sl.registerLazySingleton<PassportRemoteDataSource>(
    () => PassportRemoteDataSourceImpl(sl<ApiClient>()),
  );
  sl.registerLazySingleton<PassportRepository>(
    () => PassportRepositoryImpl(sl<PassportRemoteDataSource>()),
  );
  sl.registerLazySingleton<GetPassportUseCase>(
    () => GetPassportUseCase(sl<PassportRepository>()),
  );
  sl.registerFactory<PassportViewModel>(() => PassportViewModel(sl<GetPassportUseCase>()));

  // Feature 3: Opportunity
  sl.registerLazySingleton<OpportunityRemoteDataSource>(
    () => OpportunityRemoteDataSourceImpl(sl<ApiClient>()),
  );
  sl.registerLazySingleton<OpportunityLocalDataSource>(
    () => OpportunityLocalDataSourceImpl(sl<LocalCacheManager>()),
  );
  sl.registerLazySingleton<OpportunityRepository>(
    () => OpportunityRepositoryImpl(
      remoteDataSource: sl<OpportunityRemoteDataSource>(),
      localDataSource: sl<OpportunityLocalDataSource>(),
    ),
  );
  sl.registerLazySingleton<GetOpportunitiesUseCase>(
    () => GetOpportunitiesUseCase(sl<OpportunityRepository>()),
  );
  sl.registerFactory<OpportunityViewModel>(
    () => OpportunityViewModel(sl<GetOpportunitiesUseCase>()),
  );

  // Feature 4: Team
  sl.registerLazySingleton<TeamRemoteDataSource>(
    () => TeamRemoteDataSourceImpl(sl<ApiClient>()),
  );
  sl.registerLazySingleton<TeamRepository>(
    () => TeamRepositoryImpl(sl<TeamRemoteDataSource>()),
  );
  sl.registerLazySingleton<GetTeamsByCompetitionUseCase>(
    () => GetTeamsByCompetitionUseCase(sl<TeamRepository>()),
  );
  sl.registerLazySingleton<CreateTeamUseCase>(
    () => CreateTeamUseCase(sl<TeamRepository>()),
  );
  sl.registerLazySingleton<JoinTeamUseCase>(
    () => JoinTeamUseCase(sl<TeamRepository>()),
  );
  sl.registerLazySingleton<LeaveTeamUseCase>(
    () => LeaveTeamUseCase(sl<TeamRepository>()),
  );
  sl.registerFactory<TeamViewModel>(
    () => TeamViewModel(
      getTeamsUseCase: sl<GetTeamsByCompetitionUseCase>(),
      createTeamUseCase: sl<CreateTeamUseCase>(),
      joinTeamUseCase: sl<JoinTeamUseCase>(),
      leaveTeamUseCase: sl<LeaveTeamUseCase>(),
      secureStorage: sl<SecureStorageHelper>(),
    ),
  );

  // Feature 5: Chat
  sl.registerLazySingleton<ChatRemoteDataSource>(
    () => ChatRemoteDataSourceImpl(sl<ApiClient>()),
  );
  sl.registerLazySingleton<ChatRepository>(
    () => ChatRepositoryImpl(sl<ChatRemoteDataSource>()),
  );
  sl.registerLazySingleton<GetChatRoomsUseCase>(
    () => GetChatRoomsUseCase(sl<ChatRepository>()),
  );
  sl.registerLazySingleton<GetMessagesUseCase>(
    () => GetMessagesUseCase(sl<ChatRepository>()),
  );
  sl.registerLazySingleton<SendMessageUseCase>(
    () => SendMessageUseCase(sl<ChatRepository>()),
  );
  sl.registerFactory<ChatViewModel>(
    () => ChatViewModel(
      getRoomsUseCase: sl<GetChatRoomsUseCase>(),
      getMessagesUseCase: sl<GetMessagesUseCase>(),
      sendMessageUseCase: sl<SendMessageUseCase>(),
      mqttManager: sl<MqttManager>(),
      secureStorage: sl<SecureStorageHelper>(),
    ),
  );
}
