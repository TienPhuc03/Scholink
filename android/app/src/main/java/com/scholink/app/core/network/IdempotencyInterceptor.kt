package com.scholink.app.core.network

import okhttp3.Interceptor
import okhttp3.Response
import java.util.UUID

class IdempotencyInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        val isMutating = request.method in listOf("POST", "PUT", "PATCH")
        val hasKey = request.header("Idempotency-Key") != null

        val finalRequest = if (isMutating && !hasKey) {
            request.newBuilder()
                .addHeader("Idempotency-Key", UUID.randomUUID().toString())
                .build()
        } else {
            request
        }

        return chain.proceed(finalRequest)
    }
}
