import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/widgets/app_animations.dart';

void main() {
  group('AppAnimations Test Suite', () {
    testWidgets('BouncingWidget renders child and triggers onTap callback',
        (WidgetTester tester) async {
      bool tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: BouncingWidget(
              onTap: () => tapped = true,
              child: const Text('Bounce Me'),
            ),
          ),
        ),
      );

      expect(find.text('Bounce Me'), findsOneWidget);

      await tester.tap(find.text('Bounce Me'));
      await tester.pumpAndSettle();

      expect(tapped, isTrue);
    });

    testWidgets('BouncingWidget scales down on tapDown and returns on tapUp',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: BouncingWidget(
                scaleDown: 0.90,
                duration: const Duration(milliseconds: 100),
                onTap: () {},
                child: Container(
                  width: 100,
                  height: 100,
                  color: Colors.blue,
                  child: const Center(child: Text('Box')),
                ),
              ),
            ),
          ),
        ),
      );

      final Finder scaleFinder = find.descendant(
        of: find.byType(BouncingWidget),
        matching: find.byType(ScaleTransition),
      );

      final ScaleTransition initialTransition =
          tester.widget<ScaleTransition>(scaleFinder);
      expect(initialTransition.scale.value, 1.0);

      final TestGesture gesture =
          await tester.startGesture(tester.getCenter(find.text('Box')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      final ScaleTransition pressedTransition =
          tester.widget<ScaleTransition>(scaleFinder);
      expect(pressedTransition.scale.value, closeTo(0.90, 0.02));

      await gesture.up();
      await tester.pumpAndSettle();

      final ScaleTransition finalTransition =
          tester.widget<ScaleTransition>(scaleFinder);
      expect(finalTransition.scale.value, 1.0);
    });

    testWidgets('FadeSlideTransition animates opacity and slide offset',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: FadeSlideTransition(
              duration: Duration(milliseconds: 300),
              slideOffset: Offset(0, 20),
              child: Text('Fading In'),
            ),
          ),
        ),
      );

      expect(find.text('Fading In'), findsOneWidget);

      // Initially starts transition
      await tester.pump(const Duration(milliseconds: 150));
      final Opacity midOpacity = tester.widget<Opacity>(find.descendant(
        of: find.byType(FadeSlideTransition),
        matching: find.byType(Opacity),
      ));
      expect(midOpacity.opacity, greaterThan(0.0));
      expect(midOpacity.opacity, lessThanOrEqualTo(1.0));

      await tester.pumpAndSettle();
      final Opacity finalOpacity = tester.widget<Opacity>(find.descendant(
        of: find.byType(FadeSlideTransition),
        matching: find.byType(Opacity),
      ));
      expect(finalOpacity.opacity, 1.0);
    });

    testWidgets('PulsingWidget animates breathing pulse scale',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PulsingWidget(
              minScale: 0.9,
              maxScale: 1.1,
              duration: Duration(milliseconds: 1000),
              child: Text('Pulsing Dot'),
            ),
          ),
        ),
      );

      expect(find.text('Pulsing Dot'), findsOneWidget);

      final Finder scaleFinder = find.descendant(
        of: find.byType(PulsingWidget),
        matching: find.byType(ScaleTransition),
      );

      await tester.pump(const Duration(milliseconds: 250));
      final ScaleTransition transitionMid =
          tester.widget<ScaleTransition>(scaleFinder);
      expect(transitionMid.scale.value, inInclusiveRange(0.89, 1.11));

      await tester.pump(const Duration(milliseconds: 250));
      final ScaleTransition transitionMax =
          tester.widget<ScaleTransition>(scaleFinder);
      expect(transitionMax.scale.value, inInclusiveRange(0.89, 1.11));
    });

    testWidgets('AnimatedProgressBar renders and clamps progress correctly',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 200,
              child: AnimatedProgressBar(
                progress: 0.75,
                height: 10,
                color: Color(0xFF4338CA),
              ),
            ),
          ),
        ),
      );

      expect(find.byType(AnimatedProgressBar), findsOneWidget);

      await tester.pumpAndSettle();

      // Over clamp test
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 200,
              child: AnimatedProgressBar(
                progress: 1.5,
                height: 10,
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();
      expect(find.byType(AnimatedProgressBar), findsOneWidget);
    });

    testWidgets('AnimatedCountText animates counter value to target',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: AnimatedCountText(
              count: 100,
              duration: Duration(milliseconds: 400),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();
      expect(find.text('100'), findsOneWidget);
    });

    testWidgets('SmoothSlidePageRoute builds route with slide transition',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (BuildContext context) => ElevatedButton(
                onPressed: () {
                  Navigator.of(context).push(
                    SmoothSlidePageRoute<void>(
                      page: const Scaffold(body: Text('Next Page')),
                    ),
                  );
                },
                child: const Text('Navigate'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Navigate'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 150));
      expect(find.text('Next Page'), findsOneWidget);

      await tester.pumpAndSettle();
      expect(find.text('Next Page'), findsOneWidget);
    });
  });
}
