import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/services/user_avatar_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('the avatar follows the account from the server and is dropped on clear', () {
    final UserAvatarService s = UserAvatarService.instance;
    s.setAvatarBytes(Uint8List.fromList(<int>[1, 2, 3]));
    expect(s.hasAvatar, isTrue);

    // Account A's Passport loads with its own photo: the local preview is replaced.
    s.setFromServer('http://minio/a.png');
    expect(s.avatarBytes, isNull);
    expect(s.avatarUrl, 'http://minio/a.png');

    // Logout/login: nothing of account A is left for account B.
    s.clear();
    expect(s.hasAvatar, isFalse);

    // Account B has no avatar on the server.
    s.setFromServer('');
    expect(s.hasAvatar, isFalse);
  });
}
