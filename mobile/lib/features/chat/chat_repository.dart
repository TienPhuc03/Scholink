import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'chat_model.dart';

/// Single concrete Repository for Chat in MVVM + Repository pattern.
class ChatRepository {
  final ApiClient _apiClient;

  ChatRepository(this._apiClient);

  Future<Result<List<ChatRoomModel>, Failure>> getMyRooms() async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.chatRooms,
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData['rooms'] ?? resData)
          : resData;

      List<dynamic> rawList = <dynamic>[];
      if (payload is List) {
        rawList = payload;
      }

      final List<ChatRoomModel> rooms = rawList
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => ChatRoomModel.fromJson(item))
          .toList();

      return SuccessResult<List<ChatRoomModel>, Failure>(rooms);
    } on Failure catch (failure) {
      return FailureResult<List<ChatRoomModel>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<ChatRoomModel>, Failure>(ServerFailure(message: e.toString()));
    }
  }

  Future<Result<List<ChatMessageModel>, Failure>> getMessages(String roomId) async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.chatMessages(roomId),
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData['messages'] ?? resData)
          : resData;

      List<dynamic> rawList = <dynamic>[];
      if (payload is List) {
        rawList = payload;
      }

      final List<ChatMessageModel> messages = rawList
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => ChatMessageModel.fromJson(item))
          .toList();

      return SuccessResult<List<ChatMessageModel>, Failure>(messages);
    } on Failure catch (failure) {
      return FailureResult<List<ChatMessageModel>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<ChatMessageModel>, Failure>(ServerFailure(message: e.toString()));
    }
  }

  Future<Result<ChatMessageModel, Failure>> sendMessage({
    required String roomId,
    required String content,
    String? assetId,
  }) async {
    final String trimmed = content.trim();
    if (trimmed.isEmpty) {
      return const FailureResult<ChatMessageModel, Failure>(
        ValidationFailure(message: 'Nội dung tin nhắn không được để trống.'),
      );
    }

    try {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.chatMessages(roomId),
        data: <String, dynamic>{
          'content': trimmed,
          if (assetId != null) 'assetId': assetId,
        },
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        return SuccessResult<ChatMessageModel, Failure>(ChatMessageModel.fromJson(payload));
      }

      return const FailureResult<ChatMessageModel, Failure>(
        ServerFailure(message: 'Phản hồi gửi tin nhắn từ máy chủ không hợp lệ.'),
      );
    } on Failure catch (failure) {
      return FailureResult<ChatMessageModel, Failure>(failure);
    } catch (e) {
      return FailureResult<ChatMessageModel, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
