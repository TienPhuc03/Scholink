import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'application_model.dart';
import 'attachment_model.dart';

/// Media upload (F13 backend) for application attachments.
///
/// The backend storage is simulated: `upload-url` returns a placeholder URL on a host that does
/// not exist, and `complete` inspects the file header and a text sample to mark the asset
/// READY or REJECTED. So the byte upload step is skipped for now; once real object storage is
/// wired in, PUT the bytes to `uploadUrl` between the two calls.
class MediaRepository {
  final ApiClient _api;

  MediaRepository(this._api);

  /// Returns the READY asset id. A rejected scan comes back as a ServerFailure
  /// (code MALICIOUS_FILE_DETECTED or a validation error) with the backend's reason.
  Future<Result<String, Failure>> uploadAttachment(PickedAttachment file) async {
    try {
      final String mime = AttachmentRules.mimeForExtension(file.name) ?? 'application/octet-stream';
      final Response<dynamic> created = await _api.post<dynamic>(
        ApiEndpoints.mediaUploadUrl,
        data: <String, dynamic>{
          'category': 'ATTACHMENT',
          'fileName': file.name,
          'mimeType': mime,
          'sizeBytes': file.bytes.length,
          'sha256': sha256.convert(file.bytes).toString(),
        },
      );
      final Map<String, dynamic> asset = unwrapData(created.data);
      final String assetId = (asset['assetId'] ?? asset['id'] ?? '').toString();
      if (assetId.isEmpty) {
        throw const ServerFailure(message: 'Máy chủ không trả về mã tệp.');
      }

      final int headerLen = file.bytes.length < 16 ? file.bytes.length : 16;
      final int sampleLen = file.bytes.length < 2048 ? file.bytes.length : 2048;
      final Response<dynamic> completed = await _api.post<dynamic>(
        ApiEndpoints.mediaComplete(assetId),
        data: <String, dynamic>{
          // First 16 bytes as hex: the backend checks magic bytes (PDF/PNG/JPEG/WEBP).
          'fileHeaderHex':
              file.bytes.sublist(0, headerLen).map((int b) => b.toRadixString(16).padLeft(2, '0')).join(),
          'sampleContent': latin1.decode(file.bytes.sublist(0, sampleLen), allowInvalid: true),
          'actualSizeBytes': file.bytes.length,
        },
      );
      final Map<String, dynamic> done = unwrapData(completed.data);
      final String status = (done['status'] ?? '').toString().toUpperCase();
      if (status.isNotEmpty && status != 'READY') {
        throw ServerFailure(message: 'Tệp chưa sẵn sàng (trạng thái $status).', code: 'ASSET_NOT_READY');
      }
      return SuccessResult<String, Failure>(assetId);
    } on Failure catch (f) {
      return FailureResult<String, Failure>(f);
    } catch (e) {
      return FailureResult<String, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
