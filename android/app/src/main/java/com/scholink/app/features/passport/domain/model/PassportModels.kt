package com.scholink.app.features.passport.domain.model

data class PassportDetail(
    val studentId: String,
    val fullName: String,
    val bio: String?,
    val avatarAssetId: String?,
    val completionScore: Int,
    val profileVersion: Int,
    val education: EducationDetail?,
    val skills: List<String>?,
    val achievements: List<String>?,
    val isLookingForTeammate: Boolean,
    val isOpenForScholarship: Boolean
)

data class EducationDetail(
    val institution: String,
    val major: String,
    val startYear: Int,
    val endYear: Int?,
    val gpa: Double?,
    val gpaScale: Double?
)
