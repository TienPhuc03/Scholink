/// Auth and User Model for MVVM Architecture.
class UserModel {
  final String id;
  final String email;
  final String fullName;
  final String role;

  const UserModel({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
  });

  bool get isStudent => role.toUpperCase() == 'STUDENT';
  bool get isOrganizer => role.toUpperCase() == 'ORGANIZER';
  bool get isAdmin => role.toUpperCase() == 'ADMIN';

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: (json['id'] ?? json['userId'] ?? '') as String,
      email: (json['email'] ?? '') as String,
      fullName: (json['fullName'] ?? json['name'] ?? '') as String,
      role: (json['role'] ?? 'STUDENT') as String,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'email': email,
        'fullName': fullName,
        'role': role,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UserModel &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          email == other.email;

  @override
  int get hashCode => id.hashCode ^ email.hashCode;
}

/// Backward compatibility alias for views expecting UserEntity
typedef UserEntity = UserModel;

/// Mirrors the backend `OtpPurposeSchema` enum.
enum OtpPurpose {
  verifyEmail('VERIFY_EMAIL'),
  resetPassword('RESET_PASSWORD');

  final String apiValue;
  const OtpPurpose(this.apiValue);
}

/// Result of `POST /auth/send-otp` and `POST /auth/forgot-password` (SendOtpResponse).
class OtpTicket {
  final String email;
  final int expiresInSeconds;
  final int cooldownSeconds;
  final String message;

  /// Raw OTP the backend echoes outside production, so the demo works without a mail server.
  final String? devOtpPreview;

  const OtpTicket({
    required this.email,
    this.expiresInSeconds = 300,
    this.cooldownSeconds = 60,
    this.message = '',
    this.devOtpPreview,
  });

  factory OtpTicket.fromJson(Map<String, dynamic> json, {required String fallbackEmail}) {
    final String preview = (json['devOtpPreview'] as String?) ?? '';
    final int expires = (json['expiresInSeconds'] as num?)?.toInt() ?? 0;
    final int cooldown = (json['cooldownSeconds'] as num?)?.toInt() ?? 0;
    return OtpTicket(
      email: (json['email'] as String?)?.isNotEmpty == true ? json['email'] as String : fallbackEmail,
      expiresInSeconds: expires > 0 ? expires : 300,
      cooldownSeconds: cooldown > 0 ? cooldown : 60,
      message: (json['message'] as String?) ?? '',
      devOtpPreview: preview.isEmpty ? null : preview,
    );
  }
}
