import 'package:flutter/material.dart';

/// Reusable Skeleton Shimmer Effect that smoothly animates a highlight gradient across its child.
class SkeletonShimmer extends StatefulWidget {
  final Widget child;
  final Color baseColor;
  final Color highlightColor;
  final Duration duration;

  const SkeletonShimmer({
    super.key,
    required this.child,
    this.baseColor = const Color(0xFFE2E8F0),
    this.highlightColor = const Color(0xFFF8FAFC),
    this.duration = const Duration(milliseconds: 1400),
  });

  @override
  State<SkeletonShimmer> createState() => _SkeletonShimmerState();
}

class _SkeletonShimmerState extends State<SkeletonShimmer>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (BuildContext context, Widget? child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (Rect bounds) {
            return LinearGradient(
              begin: const Alignment(-1.0, -0.3),
              end: const Alignment(1.0, 0.3),
              colors: <Color>[
                widget.baseColor,
                widget.highlightColor,
                widget.baseColor,
              ],
              stops: const <double>[0.1, 0.5, 0.9],
              transform: _SlidingGradientTransform(
                slidePercent: _controller.value,
              ),
            ).createShader(bounds);
          },
          child: widget.child,
        );
      },
    );
  }
}

class _SlidingGradientTransform extends GradientTransform {
  final double slidePercent;
  const _SlidingGradientTransform({required this.slidePercent});

  @override
  Matrix4? transform(Rect bounds, {TextDirection? textDirection}) {
    return Matrix4.translationValues(
      bounds.width * (2 * slidePercent - 1),
      0.0,
      0.0,
    );
  }
}

/// Primitive Skeleton Box
class SkeletonBox extends StatelessWidget {
  final double? width;
  final double? height;
  final double borderRadius;
  final EdgeInsetsGeometry? margin;
  final Color color;

  const SkeletonBox({
    super.key,
    this.width,
    this.height,
    this.borderRadius = 8.0,
    this.margin,
    this.color = const Color(0xFFE2E8F0),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      margin: margin,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(borderRadius),
      ),
    );
  }
}

/// Primitive Skeleton Circle
class SkeletonCircle extends StatelessWidget {
  final double radius;
  final Color color;

  const SkeletonCircle({
    super.key,
    this.radius = 20.0,
    this.color = const Color(0xFFE2E8F0),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }
}

/// Primitive Skeleton Text line
class SkeletonText extends StatelessWidget {
  final double? width;
  final double height;
  final double borderRadius;

  const SkeletonText({
    super.key,
    this.width,
    this.height = 14.0,
    this.borderRadius = 4.0,
  });

  @override
  Widget build(BuildContext context) {
    return SkeletonBox(
      width: width,
      height: height,
      borderRadius: borderRadius,
    );
  }
}

// ============================================================================
// 1. OPPORTUNITY LIST SKELETON
// ============================================================================
class OpportunityCardSkeleton extends StatelessWidget {
  const OpportunityCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.0),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 10,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Header row: Category Pill + Bookmark
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              SkeletonBox(width: 80, height: 24, borderRadius: 12),
              SkeletonBox(width: 24, height: 24, borderRadius: 6),
            ],
          ),
          SizedBox(height: 12),

          // Title: 2 lines
          SkeletonText(width: double.infinity, height: 16),
          SizedBox(height: 6),
          SkeletonText(width: 200, height: 16),
          SizedBox(height: 12),

          // Subtitle / Organizer
          Row(
            children: <Widget>[
              SkeletonCircle(radius: 10),
              SizedBox(width: 8),
              SkeletonText(width: 140, height: 12),
            ],
          ),
          SizedBox(height: 14),

          // Image cover placeholder
          SkeletonBox(
            width: double.infinity,
            height: 150,
            borderRadius: 12,
          ),
          SizedBox(height: 14),

          // Footer info row: Deadline + Action button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              SkeletonBox(width: 110, height: 20, borderRadius: 6),
              SkeletonBox(width: 100, height: 36, borderRadius: 18),
            ],
          ),
        ],
      ),
    );
  }
}

class OpportunityListSkeleton extends StatelessWidget {
  final int count;
  const OpportunityListSkeleton({super.key, this.count = 3});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        shrinkWrap: true,
        itemCount: count,
        padding: const EdgeInsets.only(top: 8.0, bottom: 24.0),
        itemBuilder: (BuildContext context, int index) =>
            const OpportunityCardSkeleton(),
      ),
    );
  }
}

// ============================================================================
// 2. OPPORTUNITY DETAIL SKELETON
// ============================================================================
class OpportunityDetailSkeleton extends StatelessWidget {
  const OpportunityDetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const SkeletonShimmer(
      child: SingleChildScrollView(
        physics: NeverScrollableScrollPhysics(),
        padding: EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Banner Cover
            SkeletonBox(
              width: double.infinity,
              height: 200,
              borderRadius: 20,
            ),
            SizedBox(height: 20),

            // Category + Bookmark
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                SkeletonBox(width: 90, height: 26, borderRadius: 12),
                SkeletonBox(width: 32, height: 32, borderRadius: 8),
              ],
            ),
            SizedBox(height: 14),

            // Title
            SkeletonText(width: double.infinity, height: 22),
            SizedBox(height: 8),
            SkeletonText(width: 240, height: 22),
            SizedBox(height: 16),

            // Metadata Row (Date, Format, Location)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                SkeletonBox(width: 90, height: 48, borderRadius: 10),
                SkeletonBox(width: 90, height: 48, borderRadius: 10),
                SkeletonBox(width: 90, height: 48, borderRadius: 10),
              ],
            ),
            SizedBox(height: 24),

            // Section 1: Description
            SkeletonText(width: 120, height: 18),
            SizedBox(height: 10),
            SkeletonText(width: double.infinity, height: 14),
            SizedBox(height: 6),
            SkeletonText(width: double.infinity, height: 14),
            SizedBox(height: 6),
            SkeletonText(width: 180, height: 14),
            SizedBox(height: 24),

            // Section 2: Main Info Table
            SkeletonBox(
              width: double.infinity,
              height: 140,
              borderRadius: 16,
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// 3. TEAM LIST SKELETON
// ============================================================================
class TeamCardSkeleton extends StatelessWidget {
  const TeamCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.0),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 10,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Header: Avatar + Title + Status Pill
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              SkeletonBox(width: 44, height: 44, borderRadius: 12),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    SkeletonText(width: 140, height: 16),
                    SizedBox(height: 6),
                    SkeletonText(width: 180, height: 12),
                  ],
                ),
              ),
              SkeletonBox(width: 80, height: 24, borderRadius: 12),
            ],
          ),
          SizedBox(height: 14),

          // Description
          SkeletonText(width: double.infinity, height: 13),
          SizedBox(height: 6),
          SkeletonText(width: 220, height: 13),
          SizedBox(height: 16),

          // Footer: Member count + Tags + Action button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Row(
                children: <Widget>[
                  SkeletonBox(width: 90, height: 20, borderRadius: 6),
                  SizedBox(width: 8),
                  SkeletonBox(width: 70, height: 20, borderRadius: 6),
                ],
              ),
              SkeletonBox(width: 90, height: 34, borderRadius: 10),
            ],
          ),
        ],
      ),
    );
  }
}

class TeamListSkeleton extends StatelessWidget {
  final int count;
  const TeamListSkeleton({super.key, this.count = 4});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        shrinkWrap: true,
        itemCount: count,
        padding: const EdgeInsets.only(top: 8.0, bottom: 24.0),
        itemBuilder: (BuildContext context, int index) =>
            const TeamCardSkeleton(),
      ),
    );
  }
}

// ============================================================================
// 4. CHAT LIST SKELETON
// ============================================================================
class ChatRoomCardSkeleton extends StatelessWidget {
  const ChatRoomCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
      padding: const EdgeInsets.all(14.0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.0),
        border: Border.all(color: const Color(0xFFF1F5F9), width: 1.5),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x06000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SkeletonCircle(radius: 22),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: <Widget>[
                    SkeletonText(width: 160, height: 15),
                    SkeletonText(width: 35, height: 12),
                  ],
                ),
                SizedBox(height: 8),
                SkeletonText(width: double.infinity, height: 13),
                SizedBox(height: 8),
                SkeletonBox(width: 32, height: 18, borderRadius: 6),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ChatListSkeleton extends StatelessWidget {
  final int count;
  const ChatListSkeleton({super.key, this.count = 5});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        shrinkWrap: true,
        itemCount: count,
        padding: const EdgeInsets.symmetric(vertical: 8.0),
        itemBuilder: (BuildContext context, int index) =>
            const ChatRoomCardSkeleton(),
      ),
    );
  }
}

// ============================================================================
// 5. PASSPORT SKELETON
// ============================================================================
class PassportSkeleton extends StatelessWidget {
  const PassportSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: SingleChildScrollView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: <Widget>[
            // Top Profile Card
            Container(
              padding: const EdgeInsets.all(20.0),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFF1F5F9)),
              ),
              child: const Column(
                children: <Widget>[
                  SkeletonCircle(radius: 42),
                  SizedBox(height: 14),
                  SkeletonText(width: 160, height: 18),
                  SizedBox(height: 8),
                  SkeletonText(width: 200, height: 13),
                  SizedBox(height: 16),
                  SkeletonBox(width: double.infinity, height: 42, borderRadius: 12),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Section Card 1
            Container(
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFF1F5F9)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SkeletonText(width: 140, height: 16),
                  SizedBox(height: 12),
                  SkeletonBox(width: double.infinity, height: 80, borderRadius: 10),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Section Card 2
            Container(
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFF1F5F9)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SkeletonText(width: 120, height: 16),
                  SizedBox(height: 12),
                  SkeletonBox(width: double.infinity, height: 90, borderRadius: 10),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// 6. NOTIFICATION LIST SKELETON
// ============================================================================
class NotificationItemSkeleton extends StatelessWidget {
  const NotificationItemSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
      padding: const EdgeInsets.all(14.0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF1F5F9)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SkeletonCircle(radius: 20),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                SkeletonText(width: 180, height: 14),
                SizedBox(height: 6),
                SkeletonText(width: double.infinity, height: 12),
                SizedBox(height: 6),
                SkeletonText(width: 80, height: 10),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class NotificationListSkeleton extends StatelessWidget {
  final int count;
  const NotificationListSkeleton({super.key, this.count = 6});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        shrinkWrap: true,
        itemCount: count,
        padding: const EdgeInsets.symmetric(vertical: 8.0),
        itemBuilder: (BuildContext context, int index) =>
            const NotificationItemSkeleton(),
      ),
    );
  }
}
