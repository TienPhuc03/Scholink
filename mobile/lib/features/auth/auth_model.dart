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
