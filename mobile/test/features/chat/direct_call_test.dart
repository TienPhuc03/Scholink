import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/features/chat/direct_call_view.dart';
import 'package:scholink_mobile/features/chat/incoming_call_dialog.dart';
import 'package:scholink_mobile/features/chat/video_call_view.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DirectCallView Tests', () {
    testWidgets('renders DirectCallView in Audio Call mode',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DirectCallView(
            roomName: 'BK AI Innovators Team',
            roomId: 'room-1',
            initialType: CallType.audio,
          ),
        ),
      );

      // Verify header information
      expect(find.text('BK AI Innovators Team'), findsWidgets);
      expect(find.text('HD Voice'), findsOneWidget);
      expect(find.byIcon(Icons.keyboard_arrow_down_rounded), findsOneWidget);

      // Verify audio call controls
      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(find.byIcon(Icons.volume_up_rounded), findsOneWidget);
      expect(find.byIcon(Icons.videocam_rounded), findsOneWidget);
      expect(find.byIcon(Icons.call_end_rounded), findsOneWidget);
    });

    testWidgets('renders DirectCallView in Video Call mode with flip camera',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DirectCallView(
            roomName: 'BK AI Innovators Team',
            roomId: 'room-1',
            initialType: CallType.video,
          ),
        ),
      );

      // In video mode, HD 1080p and flip camera should be present
      expect(find.text('BK AI Innovators Team'), findsWidgets);
      expect(find.text('HD 1080p'), findsOneWidget);
      expect(find.byIcon(Icons.flip_camera_ios_rounded), findsOneWidget);
    });

    testWidgets('toggles Mic mute button in DirectCallView',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DirectCallView(
            roomName: 'BK AI Innovators Team',
            initialType: CallType.audio,
          ),
        ),
      );

      expect(find.text('Tắt Mic'), findsOneWidget);
      await tester.tap(find.text('Tắt Mic'));
      await tester.pump();

      expect(find.text('Bật Mic'), findsOneWidget);
      expect(find.byIcon(Icons.mic_off_rounded), findsOneWidget);
    });

    testWidgets('toggles Speaker button in DirectCallView',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: DirectCallView(
            roomName: 'BK AI Innovators Team',
            initialType: CallType.audio,
          ),
        ),
      );

      expect(find.text('Loa ngoài'), findsOneWidget);
      await tester.tap(find.text('Loa ngoài'));
      await tester.pump();

      expect(find.text('Loa trong'), findsOneWidget);
      expect(find.byIcon(Icons.volume_down_rounded), findsOneWidget);
    });

    testWidgets('calls onCallEnded when user hangs up',
        (WidgetTester tester) async {
      int endedDuration = -1;
      CallType? endedType;

      await tester.pumpWidget(
        MaterialApp(
          home: DirectCallView(
            roomName: 'BK AI Innovators Team',
            initialType: CallType.audio,
            onCallEnded: (int duration, CallType type) {
              endedDuration = duration;
              endedType = type;
            },
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.call_end_rounded));
      await tester.pump(const Duration(milliseconds: 350));

      expect(endedDuration, greaterThanOrEqualTo(0));
      expect(endedType, CallType.audio);
    });

    testWidgets('VideoCallView backwards compatibility wrapper renders cleanly',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: VideoCallView(
            roomName: 'BK AI Innovators Team',
            roomId: 'legacy-room-1',
          ),
        ),
      );

      expect(find.text('BK AI Innovators Team'), findsWidgets);
      expect(find.text('HD 1080p'), findsOneWidget);
    });
  });

  group('IncomingCallDialog Tests', () {
    testWidgets('renders IncomingCallDialog with Accept and Decline actions',
        (WidgetTester tester) async {
      bool accepted = false;
      bool declined = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: IncomingCallDialog(
              callerName: 'Nguyễn Văn A',
              roomName: 'BK AI Innovators Team',
              callType: CallType.audio,
              onAccept: () => accepted = true,
              onDecline: () => declined = true,
            ),
          ),
        ),
      );

      expect(find.text('Nguyễn Văn A'), findsOneWidget);
      expect(find.text('Cuộc gọi thoại đến từ BK AI Innovators Team...'),
          findsOneWidget);
      expect(find.text('Từ chối'), findsOneWidget);
      expect(find.text('Trả lời'), findsOneWidget);

      await tester.tap(find.text('Trả lời'));
      expect(accepted, isTrue);

      await tester.tap(find.text('Từ chối'));
      expect(declined, isTrue);
    });
  });
}
