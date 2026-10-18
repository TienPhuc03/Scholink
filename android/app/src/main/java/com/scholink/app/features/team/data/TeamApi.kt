package com.scholink.app.features.team.data

import com.scholink.app.features.team.domain.model.CreateTeamRequest
import com.scholink.app.features.team.domain.model.TeamDetail
import retrofit2.Response
import retrofit2.http.*

interface TeamApi {
    @POST("api/v1/teams")
    suspend fun createTeam(@Body request: CreateTeamRequest): Response<TeamDetail>

    @POST("api/v1/teams/{id}/join")
    suspend fun joinTeam(@Path("id") teamId: String): Response<Map<String, Any>>

    @POST("api/v1/teams/{id}/leave")
    suspend fun leaveTeam(@Path("id") teamId: String): Response<Map<String, Any>>

    @GET("api/v1/teams/competitions/{competitionId}")
    suspend fun getTeamsByCompetition(@Path("competitionId") competitionId: String): Response<List<TeamDetail>>
}
