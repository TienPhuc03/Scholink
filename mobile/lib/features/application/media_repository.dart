import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'application_model.dart';
import 'attachment_model.dart';

/// Uploads a file to the bucket at a presigned URL. Separate from [ApiClient] on purpose: the
/// presigned URL carries its own signature and must not get the app's Bearer header.
typedef PresignedPut = Future<void> Function(String url, List<int> bytes, String mimeType);

Future<void> _dioPut(String url, List<int> bytes, String mimeType) async {
  await Dio().put<dynamic>(
    url,
    data: Stream<List<int>>.value(bytes),
    options: Options(headers: <String, dynamic>{
      Headers.contentTypeHeader: mimeType,
      Headers.contentLengthHeader: bytes.length,
    }),
  );
}

/// Media upload (F13 backend): `upload-url` → PUT bytes to the presigned URL → `complete`.
///
/// When the backend has no object storage it returns a placeholder URL on
/// `storage.scholink.edu.vn`; then no bytes are sent and `complete` scans the header and text
/// sample the app reports. With MinIO the backend scans the stored bytes itself.
class MediaRepository {
  final ApiClient _api;
  final PresignedPut _put;

  MediaRepository(this._api, {PresignedPut? put}) : _put = put ?? _dioPut;

  static bool _isPlaceholder(String url) => url.isEmpty || Uri.tryParse(url)?.host == 'storage.scholink.edu.vn';

  /// Returns the READY asset id. A rejected scan comes back as a ServerFailure
  /// (code MALICIOUS_FILE_DETECTED or a validation error) with the backend's reason.
  Future<Result<String, Failure>> uploadAttachment(PickedAttachment file) => upload(file, category: 'ATTACHMENT');

  /// [category] is one of the backend MediaCategory values (ATTACHMENT, CV, AVATAR, ...).
  Future<Result<String, Failure>> upload(PickedAttachment file, {required String category, String? mimeType}) async {
    try {
      final String mime = mimeType ?? AttachmentRules.mimeForExtension(file.name) ?? 'application/octet-stream';
      final Response<dynamic> created = await _api.post<dynamic>(
        ApiEndpoints.mediaUploadUrl,
        data: <String, dynamic>{
          'category': category,
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
      final String uploadUrl = (asset['uploadUrl'] ?? '').toString();
      if (!_isPlaceholder(uploadUrl)) {
        try {
          await _put(uploadUrl, file.bytes, mime);
        } on DioException catch (e) {
          throw ServerFailure(
            message: 'Không tải được tệp lên kho lưu trữ. Kiểm tra mạng rồi thử lại.',
            code: 'UPLOAD_FAILED',
            statusCode: e.response?.statusCode,
          );
        }
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
