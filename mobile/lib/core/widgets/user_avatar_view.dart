import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/user_avatar_service.dart';

/// Renders the user's avatar automatically synchronizing with UserAvatarService.
/// Supports Memory Bytes, Data URI base64, HTTP/HTTPS URLs, and Initials fallback.
class UserAvatarView extends StatelessWidget {
  final double size;
  final double borderRadius;
  final String? fallbackInitials;
  final String? fallbackUrl;
  final VoidCallback? onTap;

  const UserAvatarView({
    super.key,
    this.size = 36,
    this.borderRadius = 12,
    this.fallbackInitials,
    this.fallbackUrl,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: UserAvatarService.instance,
      builder: (BuildContext ctx, Widget? _) {
        final UserAvatarService avatarService = UserAvatarService.instance;
        Widget imageWidget;

        if (avatarService.avatarBytes != null) {
          imageWidget = Image.memory(
            avatarService.avatarBytes!,
            fit: BoxFit.cover,
            width: size,
            height: size,
          );
        } else if (avatarService.avatarUrl != null &&
            avatarService.avatarUrl!.isNotEmpty) {
          imageWidget = _buildNetworkOrBase64(
            avatarService.avatarUrl!,
            fallbackInitials,
          );
        } else if (fallbackUrl != null && fallbackUrl!.isNotEmpty) {
          imageWidget = _buildNetworkOrBase64(
            fallbackUrl!,
            fallbackInitials,
          );
        } else {
          imageWidget = _buildInitials(fallbackInitials ?? 'S');
        }

        Widget content = ClipRRect(
          borderRadius: BorderRadius.circular(borderRadius),
          child: SizedBox(
            width: size,
            height: size,
            child: imageWidget,
          ),
        );

        if (onTap != null) {
          content = GestureDetector(onTap: onTap, child: content);
        }
        return content;
      },
    );
  }

  Widget _buildNetworkOrBase64(String src, String? initials) {
    if (src.startsWith('data:image')) {
      final int commaIdx = src.indexOf(',');
      final String b64 = commaIdx != -1 ? src.substring(commaIdx + 1) : src;
      try {
        return Image.memory(
          base64Decode(b64),
          fit: BoxFit.cover,
          width: size,
          height: size,
          errorBuilder: (_, __, ___) => _buildInitials(initials ?? 'S'),
        );
      } catch (_) {}
    }
    return Image.network(
      src,
      fit: BoxFit.cover,
      width: size,
      height: size,
      errorBuilder: (_, __, ___) => _buildInitials(initials ?? 'S'),
    );
  }

  Widget _buildInitials(String initials) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: const Color(0xFFEDE9FE),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      alignment: Alignment.center,
      child: Text(
        initials.isNotEmpty ? initials[0].toUpperCase() : 'S',
        style: TextStyle(
          fontSize: size * 0.42,
          fontWeight: FontWeight.w700,
          color: const Color(0xFF4F46E5),
        ),
      ),
    );
  }
}

/// Generic widget for rendering an image from either a Data URI Base64 or an HTTP/HTTPS URL
class AppNetworkOrBase64Image extends StatelessWidget {
  final String src;
  final BoxFit fit;
  final double? width;
  final double? height;
  final Widget? placeholder;

  const AppNetworkOrBase64Image({
    super.key,
    required this.src,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.placeholder,
  });

  @override
  Widget build(BuildContext context) {
    if (src.startsWith('data:image')) {
      final int commaIdx = src.indexOf(',');
      final String b64 = commaIdx != -1 ? src.substring(commaIdx + 1) : src;
      try {
        return Image.memory(
          base64Decode(b64),
          fit: fit,
          width: width,
          height: height,
          errorBuilder: (_, __, ___) =>
              placeholder ??
              Container(color: const Color(0xFF4F46E5)),
        );
      } catch (_) {}
    }

    return Image.network(
      src,
      fit: fit,
      width: width,
      height: height,
      errorBuilder: (_, __, ___) =>
          placeholder ??
          Container(color: const Color(0xFF4F46E5)),
    );
  }
}
