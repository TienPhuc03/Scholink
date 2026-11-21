import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/widgets/skeleton_loader.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('SkeletonLoader Primitives Tests', () {
    testWidgets('renders SkeletonBox with custom dimensions and radius',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SkeletonBox(
              width: 120,
              height: 40,
              borderRadius: 16,
            ),
          ),
        ),
      );

      final Finder finder = find.byType(SkeletonBox);
      expect(finder, findsOneWidget);

      final Container container = tester.widget<Container>(
        find.descendant(of: finder, matching: find.byType(Container)),
      );
      final BoxDecoration decoration = container.decoration as BoxDecoration;
      expect(decoration.borderRadius, BorderRadius.circular(16));
    });

    testWidgets('renders SkeletonCircle with custom radius',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SkeletonCircle(radius: 25),
          ),
        ),
      );

      final Finder finder = find.byType(SkeletonCircle);
      expect(finder, findsOneWidget);

      final Container container = tester.widget<Container>(
        find.descendant(of: finder, matching: find.byType(Container)),
      );
      final BoxDecoration decoration = container.decoration as BoxDecoration;
      expect(decoration.shape, BoxShape.circle);
    });

    testWidgets('renders SkeletonText line',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: SkeletonText(width: 150, height: 16),
          ),
        ),
      );

      expect(find.byType(SkeletonText), findsOneWidget);
      expect(find.byType(SkeletonBox), findsOneWidget);
    });
  });

  group('Screen-Specific Skeletons Tests', () {
    testWidgets('renders OpportunityListSkeleton with requested count',
        (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OpportunityListSkeleton(count: 3),
          ),
        ),
      );

      expect(find.byType(OpportunityListSkeleton), findsOneWidget);
      expect(find.byType(OpportunityCardSkeleton), findsNWidgets(3));
      expect(find.byType(SkeletonShimmer), findsOneWidget);
    });

    testWidgets('renders OpportunityDetailSkeleton',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OpportunityDetailSkeleton(),
          ),
        ),
      );

      expect(find.byType(OpportunityDetailSkeleton), findsOneWidget);
      expect(find.byType(SkeletonShimmer), findsOneWidget);
    });

    testWidgets('renders TeamListSkeleton with requested count',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TeamListSkeleton(count: 4),
          ),
        ),
      );

      expect(find.byType(TeamListSkeleton), findsOneWidget);
      expect(find.byType(TeamCardSkeleton), findsNWidgets(4));
    });

    testWidgets('renders ChatListSkeleton with requested count',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ChatListSkeleton(count: 5),
          ),
        ),
      );

      expect(find.byType(ChatListSkeleton), findsOneWidget);
      expect(find.byType(ChatRoomCardSkeleton), findsNWidgets(5));
    });

    testWidgets('renders PassportSkeleton',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PassportSkeleton(),
          ),
        ),
      );

      expect(find.byType(PassportSkeleton), findsOneWidget);
      expect(find.byType(SkeletonShimmer), findsOneWidget);
    });

    testWidgets('renders NotificationListSkeleton with requested count',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: NotificationListSkeleton(count: 6),
          ),
        ),
      );

      expect(find.byType(NotificationListSkeleton), findsOneWidget);
      expect(find.byType(NotificationItemSkeleton), findsNWidgets(6));
    });
  });
}
