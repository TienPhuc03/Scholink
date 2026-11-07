import 'dart:typed_data';

/// Attachment rules for media category `ATTACHMENT` (media-asset.entity.ts):
/// PDF or images, at most 5 MB each, at most 5 files per submission (CreatePreviewDtoSchema).
abstract final class AttachmentRules {
  static const int maxFiles = 5;
  static const int maxBytes = 5 * 1024 * 1024;
  static const List<String> extensions = <String>['pdf', 'jpg', 'jpeg', 'png', 'webp'];

  static String? mimeForExtension(String fileName) {
    final String ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : '';
    return switch (ext) {
      'pdf' => 'application/pdf',
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => null,
    };
  }

  /// Same magic-byte check the backend runs, done locally so a renamed file fails fast.
  static bool headerMatches(String mime, Uint8List bytes) {
    bool startsWith(List<int> sig) =>
        bytes.length >= sig.length && List<int>.generate(sig.length, (int i) => bytes[i]).join(',') == sig.join(',');
    return switch (mime) {
      'application/pdf' => startsWith(<int>[0x25, 0x50, 0x44, 0x46]),
      'image/png' => startsWith(<int>[0x89, 0x50, 0x4E, 0x47]),
      'image/jpeg' => startsWith(<int>[0xFF, 0xD8, 0xFF]),
      'image/webp' => startsWith(<int>[0x52, 0x49, 0x46, 0x46]),
      _ => false,
    };
  }

  /// Returns an error message, or null when the file can be attached.
  static String? validate({required String fileName, required Uint8List bytes, required int alreadyAttached}) {
    if (alreadyAttached >= maxFiles) return 'Tối đa $maxFiles tệp mỗi lần nộp.';
    final String? mime = mimeForExtension(fileName);
    if (mime == null) return 'Chỉ nhận tệp PDF, JPG, PNG hoặc WEBP.';
    if (bytes.isEmpty) return 'Tệp rỗng.';
    if (bytes.length > maxBytes) return 'Tệp vượt quá 5 MB.';
    if (!headerMatches(mime, bytes)) return 'Nội dung tệp không khớp định dạng ${fileName.split('.').last.toUpperCase()}.';
    return null;
  }
}

/// A file the user picked, independent of the picker plugin (keeps view models testable).
class PickedAttachment {
  final String name;
  final Uint8List bytes;

  const PickedAttachment({required this.name, required this.bytes});
}

enum AttachmentState { uploading, ready, rejected }

/// One attachment row in the apply flow.
class AttachmentItem {
  final String localId;
  final String fileName;
  final int sizeBytes;
  final AttachmentState state;
  final String? assetId;
  final String? error;

  const AttachmentItem({
    required this.localId,
    required this.fileName,
    required this.sizeBytes,
    required this.state,
    this.assetId,
    this.error,
  });

  AttachmentItem copyWith({AttachmentState? state, String? assetId, String? error}) => AttachmentItem(
        localId: localId,
        fileName: fileName,
        sizeBytes: sizeBytes,
        state: state ?? this.state,
        assetId: assetId ?? this.assetId,
        error: error,
      );

  String get sizeLabel {
    if (sizeBytes >= 1024 * 1024) return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(sizeBytes / 1024).ceil()} KB';
  }
}
