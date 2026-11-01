import 'package:flutter/material.dart';

/// App color palette matching Scholink Brand Design System from Figma.
abstract final class AppColors {
  // Brand Primary & Secondary (From Figma #3525CD)
  static const Color primary = Color(0xFF3525CD);
  static const Color primaryDark = Color(0xFF26199F);
  static const Color primaryLight = Color(0xFFE2E7FF);
  static const Color secondary = Color(0xFF0D9488);
  static const Color secondaryLight = Color(0xFF14B8A6);

  // Semantic Colors
  static const Color success = Color(0xFF16A34A);
  static const Color warning = Color(0xFFD97706);
  static const Color error = Color(0xFFDC2626);
  static const Color info = Color(0xFF0284C7);

  // Surface & Container Tints (Figma Specs)
  static const Color background = Color(0xFFFAF8FF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceElevated = Color(0xFFFFFFFF);
  static const Color cardInfoBackground = Color(0xFFF2F3FF);
  static const Color googleButtonBackground = Color(0xFFE2E7FF);

  // Borders
  static const Color border = Color(0xFFC7C4D8);
  static const Color borderLight = Color(0xFFEAEDFF);

  // Typography Colors
  static const Color textPrimary = Color(0xFF131B2E);
  static const Color textSecondary = Color(0xFF464555);
  static const Color textMuted = Color(0xFF777587);
  static const Color textOnPrimary = Color(0xFFFFFFFF);
}
