import 'package:flutter/material.dart';

/// App color palette matching Scholink Brand Design System from Figma.
abstract final class AppColors {
  // Brand Primary & Secondary (From Design Spec #3925D7)
  static const Color primary = Color(0xFF3925D7);
  static const Color primaryDark = Color(0xFF2B19B0);
  static const Color primaryLight = Color(0xFFEEF0FD);
  static const Color secondary = Color(0xFF0D9488);
  static const Color secondaryLight = Color(0xFF14B8A6);

  // Semantic Colors
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFD97706);
  static const Color error = Color(0xFFDC2626);
  static const Color info = Color(0xFF0284C7);

  // Surface & Container Tints (Design System: #FFFFFF / #F7F8FC)
  static const Color background = Color(0xFFF7F8FC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceElevated = Color(0xFFFFFFFF);
  static const Color cardInfoBackground = Color(0xFFF2F3FF);
  static const Color googleButtonBackground = Color(0xFFEEF0FD);

  // Borders
  static const Color border = Color(0xFFE5E7EB);
  static const Color borderLight = Color(0xFFF3F4F6);

  // Typography Colors (Design System: #111827)
  static const Color textPrimary = Color(0xFF111827);
  static const Color textSecondary = Color(0xFF4B5563);
  static const Color textMuted = Color(0xFF9CA3AF);
  static const Color textOnPrimary = Color(0xFFFFFFFF);
}
