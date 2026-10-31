/// Tier 1: Defensive DTOs with all fields nullable for network serialization.
class LoginRequestDto {
  final String email;
  final String password;

  const LoginRequestDto({
    required this.email,
    required this.password,
  });

  Map<String, dynamic> toJson() => <String, dynamic>{
        'email': email,
        'password': password,
      };
}

class RegisterRequestDto {
  final String email;
  final String password;
  final String fullName;
  final String role;

  const RegisterRequestDto({
    required this.email,
    required this.password,
    required this.fullName,
    this.role = 'STUDENT',
  });

  Map<String, dynamic> toJson() => <String, dynamic>{
        'email': email,
        'password': password,
        'fullName': fullName,
        'role': role,
      };
}

class AuthResponseDto {
  final String? accessToken;
  final String? refreshToken;
  final UserProfileDto? user;

  const AuthResponseDto({
    this.accessToken,
    this.refreshToken,
    this.user,
  });

  factory AuthResponseDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const AuthResponseDto();

    // Check if payload is wrapped inside 'data' or top-level
    final dynamic payload = json['data'] ?? json;
    if (payload is! Map<String, dynamic>) return const AuthResponseDto();

    return AuthResponseDto(
      accessToken: payload['accessToken'] as String?,
      refreshToken: payload['refreshToken'] as String?,
      user: payload['user'] != null
          ? UserProfileDto.fromJson(payload['user'] as Map<String, dynamic>?)
          : null,
    );
  }
}

class UserProfileDto {
  final String? id;
  final String? email;
  final String? fullName;
  final String? role;

  const UserProfileDto({
    this.id,
    this.email,
    this.fullName,
    this.role,
  });

  factory UserProfileDto.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const UserProfileDto();
    return UserProfileDto(
      id: (json['id'] ?? json['userId']) as String?,
      email: json['email'] as String?,
      fullName: json['fullName'] as String?,
      role: json['role'] as String?,
    );
  }
}
