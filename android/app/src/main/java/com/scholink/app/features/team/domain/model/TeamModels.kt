package com.scholink.app.features.team.domain.model

data class TeamDetail(
    val id: String,
    val competitionId: String,
    val name: String,
    val description: String?,
    val leaderId: String,
    val minSize: Int,
    val maxSize: Int,
    val status: String,
    val members: List<TeamMemberDetail>
)

data class TeamMemberDetail(
    val studentId: String,
    val role: String,
    val joinedAt: String
)

data class CreateTeamRequest(
    val competitionId: String,
    val name: String,
    val description: String?,
    val minSize: Int = 2,
    val maxSize: Int = 5
)
