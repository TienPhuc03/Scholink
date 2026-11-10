import 'package:file_picker/file_picker.dart';
import 'apply_viewmodel.dart';
import 'attachment_model.dart';

/// [AttachmentPicker] backed by the `file_picker` plugin. Loads bytes in memory
/// (files are capped at 5 MB) so they can be hashed and inspected.
class FileAttachmentPicker implements AttachmentPicker {
  @override
  Future<PickedAttachment?> pick() async {
    final FilePickerResult? result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: AttachmentRules.extensions,
      withData: true,
    );
    final PlatformFile? file = result?.files.firstOrNull;
    if (file == null || file.bytes == null) return null;
    return PickedAttachment(name: file.name, bytes: file.bytes!);
  }
}
