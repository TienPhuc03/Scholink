import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'direct_call_view.dart';

/// Modal dialog / bottom banner for incoming direct calls.
class IncomingCallDialog extends StatelessWidget {
  final String callerName;
  final String roomName;
  final String? roomId;
  final CallType callType;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const IncomingCallDialog({
    super.key,
    required this.callerName,
    required this.roomName,
    this.roomId,
    this.callType = CallType.audio,
    required this.onAccept,
    required this.onDecline,
  });

  static Future<void> show(
    BuildContext context, {
    required String callerName,
    required String roomName,
    String? roomId,
    CallType callType = CallType.audio,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (BuildContext ctx) => IncomingCallDialog(
        callerName: callerName,
        roomName: roomName,
        roomId: roomId,
        callType: callType,
        onDecline: () {
          Navigator.of(ctx).pop();
        },
        onAccept: () {
          Navigator.of(ctx).pop();
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => DirectCallView(
                roomName: roomName,
                roomId: roomId,
                initialType: callType,
                isIncoming: false,
                callerName: callerName,
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1B4B),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white24, width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Colors.black54,
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          // Top indicator pill
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white30,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 18),

          // Caller Avatar
          CircleAvatar(
            radius: 36,
            backgroundColor: AppColors.primary,
            child: Text(
              callerName.isNotEmpty ? callerName.substring(0, 1).toUpperCase() : 'S',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Caller Name & Call Type
          Text(
            callerName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Icon(
                callType == CallType.video
                    ? Icons.videocam_rounded
                    : Icons.phone_in_talk_rounded,
                size: 16,
                color: const Color(0xFF10B981),
              ),
              const SizedBox(width: 6),
              Text(
                callType == CallType.video
                    ? 'Cuộc gọi video đến từ $roomName...'
                    : 'Cuộc gọi thoại đến từ $roomName...',
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Action Buttons: Decline and Accept
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: <Widget>[
              // Decline
              GestureDetector(
                onTap: onDecline,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Container(
                      width: 58,
                      height: 58,
                      decoration: const BoxDecoration(
                        color: Color(0xFFEF4444),
                        shape: BoxShape.circle,
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: Color(0x66EF4444),
                            blurRadius: 10,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: const Icon(Icons.call_end_rounded,
                          color: Colors.white, size: 26),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Từ chối',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),

              // Accept
              GestureDetector(
                onTap: onAccept,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Container(
                      width: 58,
                      height: 58,
                      decoration: const BoxDecoration(
                        color: Color(0xFF10B981),
                        shape: BoxShape.circle,
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: Color(0x6610B981),
                            blurRadius: 10,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Icon(
                        callType == CallType.video
                            ? Icons.videocam_rounded
                            : Icons.call_rounded,
                        color: Colors.white,
                        size: 26,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Trả lời',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
