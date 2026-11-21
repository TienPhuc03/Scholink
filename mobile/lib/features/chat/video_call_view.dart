import 'package:flutter/material.dart';
import 'direct_call_view.dart';

export 'direct_call_view.dart';
export 'incoming_call_dialog.dart';

/// Legacy adapter for VideoCallView that wraps DirectCallView
/// maintaining full backwards compatibility.
class VideoCallView extends StatelessWidget {
  final String roomName;
  final String? roomId;
  final void Function(int durationSeconds, CallType callType)? onCallEnded;

  const VideoCallView({
    super.key,
    required this.roomName,
    this.roomId,
    this.onCallEnded,
  });

  @override
  Widget build(BuildContext context) {
    return DirectCallView(
      roomName: roomName,
      roomId: roomId,
      initialType: CallType.video,
      onCallEnded: onCallEnded,
    );
  }
}
