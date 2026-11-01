/// Non-nullable domain entity representing an authenticated user profile.
class UserEntity {
  final String id;
  final String email;
  final String fullName;
  final String role;

  const UserEntity({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
  });

  bool get isStudent => role.toUpperCase() == 'STUDENT';
  bool get isOrganizer => role.toUpperCase() == 'ORGANIZER';
  bool get isAdmin => role.toUpperCase() == 'ADMIN';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is UserEntity &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          email == other.email;

  @override
  int get hashCode => id.hashCode ^ email.hashCode;
}
