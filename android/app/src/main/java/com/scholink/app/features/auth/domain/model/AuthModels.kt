package com.scholink.app.features.auth.domain.model

data class LoginRequest(
    val email: String,
    val password: String
)

data class RegisterRequest(
    val email: String,
    val password: String,
    val fullName: String,
    val role: String = "STUDENT"
)

data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: UserProfile
)

data class UserProfile(
    val id: String,
    val email: String,
    val fullName: String,
    val role: String
)
