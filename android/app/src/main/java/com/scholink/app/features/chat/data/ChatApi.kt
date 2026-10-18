package com.scholink.app.features.chat.data

import com.scholink.app.features.chat.domain.model.ChatMessage
import com.scholink.app.features.chat.domain.model.ChatRoomDetail
import com.scholink.app.features.chat.domain.model.SendMessageRequest
import retrofit2.Response
import retrofit2.http.*

interface ChatApi {
    @GET("api/v1/chat/rooms")
    suspend fun getMyRooms(): Response<List<ChatRoomDetail>>

    @GET("api/v1/chat/rooms/{id}/messages")
    suspend fun getMessages(@Path("id") roomId: String): Response<List<ChatMessage>>

    @POST("api/v1/chat/rooms/{id}/messages")
    suspend fun sendMessage(
        @Path("id") roomId: String,
        @Body request: SendMessageRequest
    ): Response<ChatMessage>
}
