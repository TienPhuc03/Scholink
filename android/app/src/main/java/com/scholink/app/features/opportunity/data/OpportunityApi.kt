package com.scholink.app.features.opportunity.data

import com.scholink.app.features.opportunity.domain.model.OpportunityItem
import com.scholink.app.features.opportunity.domain.model.OpportunityListResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface OpportunityApi {
    @GET("api/v1/opportunities")
    suspend fun getOpportunities(
        @Query("type") type: String? = null,
        @Query("keyword") keyword: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 10
    ): Response<OpportunityListResponse>

    @GET("api/v1/opportunities/{id}")
    suspend fun getOpportunityById(@Path("id") id: String): Response<OpportunityItem>
}
