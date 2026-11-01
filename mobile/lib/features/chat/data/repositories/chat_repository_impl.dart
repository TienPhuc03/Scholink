import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../domain/entities/chat_entity.dart';
import '../../domain/repositories/chat_repository.dart';
import '../datasources/chat_remote_data_source.dart';
import '../dtos/chat_dtos.dart';
import '../mappers/chat_mapper.dart';

class ChatRepositoryImpl implements ChatRepository {
  final ChatRemoteDataSource _remoteDataSource;

  ChatRepositoryImpl(this._remoteDataSource);

  @override
  Future<Result<List<ChatRoomEntity>, Failure>> getMyRooms() async {
    try {
      final List<ChatRoomDto> dtos = await _remoteDataSource.getMyRooms();
      final List<ChatRoomEntity> entities = dtos.map(ChatMapper.toRoomEntity).toList();
      return SuccessResult<List<ChatRoomEntity>, Failure>(entities);
    } on Failure catch (failure) {
      return FailureResult<List<ChatRoomEntity>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<ChatRoomEntity>, Failure>(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Result<List<ChatMessageEntity>, Failure>> getMessages(String roomId) async {
    try {
      final List<ChatMessageDto> dtos = await _remoteDataSource.getMessages(roomId);
      final List<ChatMessageEntity> entities = dtos.map(ChatMapper.toMessageEntity).toList();
      return SuccessResult<List<ChatMessageEntity>, Failure>(entities);
    } on Failure catch (failure) {
      return FailureResult<List<ChatMessageEntity>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<ChatMessageEntity>, Failure>(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Result<ChatMessageEntity, Failure>> sendMessage({
    required String roomId,
    required String content,
    String? assetId,
  }) async {
    try {
      final SendMessageRequestDto request = SendMessageRequestDto(content: content, assetId: assetId);
      final ChatMessageDto dto = await _remoteDataSource.sendMessage(roomId, request);
      final ChatMessageEntity entity = ChatMapper.toMessageEntity(dto);
      return SuccessResult<ChatMessageEntity, Failure>(entity);
    } on Failure catch (failure) {
      return FailureResult<ChatMessageEntity, Failure>(failure);
    } catch (e) {
      return FailureResult<ChatMessageEntity, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
