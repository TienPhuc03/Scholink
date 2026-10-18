package com.scholink.app.features.chat.domain.model

data class ChatRoomDetail(
    val id: String,
    val type: String, // DIRECT or TEAM
    val refId: String?,
    val participants: List<String>,
    val lastMessageSnippet: String?,
    val lastMessageAt: String?
)

data class ChatMessage(
    val id: String,
    val roomId: String,
    val senderId: String,
    val content: String,
    val assetId: String?,
    val createdAt: String?
)

data class SendMessageRequest(
    val content: String,
    val assetId: String? = null
)
