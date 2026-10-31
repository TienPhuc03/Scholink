import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../dtos/chat_dtos.dart';

abstract interface class ChatRemoteDataSource {
  Future<List<ChatRoomDto>> getMyRooms();
  Future<List<ChatMessageDto>> getMessages(String roomId);
  Future<ChatMessageDto> sendMessage(String roomId, SendMessageRequestDto request);
}

class ChatRemoteDataSourceImpl implements ChatRemoteDataSource {
  final ApiClient _apiClient;

  ChatRemoteDataSourceImpl(this._apiClient);

  @override
  Future<List<ChatRoomDto>> getMyRooms() async {
    final Response<dynamic> response = await _apiClient.get<dynamic>(
      ApiEndpoints.chatRooms,
    );

    final dynamic resData = response.data;
    final dynamic payload = (resData is Map<String, dynamic>)
        ? (resData['data'] ?? resData['rooms'] ?? resData)
        : resData;

    if (payload is List) {
      return payload
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => ChatRoomDto.fromJson(item))
          .toList();
    }
    return <ChatRoomDto>[];
  }

  @override
  Future<List<ChatMessageDto>> getMessages(String roomId) async {
    final Response<dynamic> response = await _apiClient.get<dynamic>(
      ApiEndpoints.chatMessages(roomId),
    );

    final dynamic resData = response.data;
    final dynamic payload = (resData is Map<String, dynamic>)
        ? (resData['data'] ?? resData['messages'] ?? resData)
        : resData;

    if (payload is List) {
      return payload
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => ChatMessageDto.fromJson(item))
          .toList();
    }
    return <ChatMessageDto>[];
  }

  @override
  Future<ChatMessageDto> sendMessage(String roomId, SendMessageRequestDto request) async {
    final Response<dynamic> response = await _apiClient.post<dynamic>(
      ApiEndpoints.chatMessages(roomId),
      data: request.toJson(),
    );

    final dynamic resData = response.data;
    final dynamic payload = (resData is Map<String, dynamic>)
        ? (resData['data'] ?? resData)
        : resData;

    if (payload is Map<String, dynamic>) {
      return ChatMessageDto.fromJson(payload);
    }
    return const ChatMessageDto();
  }
}
