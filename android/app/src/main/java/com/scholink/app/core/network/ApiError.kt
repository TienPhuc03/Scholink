package com.scholink.app.core.network

import com.google.gson.annotations.SerializedName

data class ErrorResponse(
    @SerializedName("error")
    val error: ApiErrorDetail
)

data class ApiErrorDetail(
    @SerializedName("code")
    val code: String,
    @SerializedName("message")
    val message: String,
    @SerializedName("details")
    val details: List<Any>?,
    @SerializedName("correlationId")
    val correlationId: String?
)
