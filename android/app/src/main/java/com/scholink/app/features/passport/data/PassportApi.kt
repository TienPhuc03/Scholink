package com.scholink.app.features.passport.data

import com.scholink.app.features.passport.domain.model.PassportDetail
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Body

interface PassportApi {
    @GET("api/v1/profiles/me")
    suspend fun getMyPassport(): Response<PassportDetail>

    @PUT("api/v1/profiles/me")
    suspend fun updatePassport(@Body data: Map<String, Any>): Response<PassportDetail>
}
