import { Injectable, Inject, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  DomainException,
  ErrorCode,
  CryptoService,
  CreateUploadUrlDto,
  CompleteUploadDto,
} from '@shared';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
import { MediaAsset } from '../../domain/media-asset.entity';
import { ObjectStorageService } from '../../infrastructure/storage/object-storage.service';

const UPLOAD_URL_TTL_SECONDS = 900; // 15 phút theo SRS FR-PROF-04
const DOWNLOAD_URL_TTL_SECONDS = 300;
// Largest category limit (PITCH_VIDEO 20MB) plus one byte, so an oversized upload is still detected.
const MAX_SCAN_BYTES = 20 * 1024 * 1024 + 1;

@Injectable()
export class MediaUseCase {
  constructor(
    @Inject(PASSPORT_REPOSITORY) private readonly passportRepo: IPassportRepository,
    private readonly cryptoService: CryptoService,
    @Optional() private readonly storage?: ObjectStorageService,
  ) {}

  /**
   * Bước 1 (FR-PROF-04): Kiểm tra MIME type và dung lượng tối đa tại biên,
   * tạo bản ghi MediaAsset ở trạng thái UPLOADING và cấp Presigned Upload URL.
   */
  async createUploadUrl(ownerId: string, dto: CreateUploadUrlDto) {
    if (!ownerId || !ownerId.trim()) {
      throw new DomainException(ErrorCode.UNAUTHENTICATED, 'Yêu cầu đăng nhập để tải tệp lên', 401);
    }

    const assetId = `ast_${crypto.randomUUID()}`;
    const asset = MediaAsset.createInitiated({
      id: assetId,
      ownerId: ownerId.trim(),
      category: dto.category,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      sha256: dto.sha256,
    });

    await this.passportRepo.saveMediaAsset(asset);

    const expiresAtEpoch = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS;
    const uploadToken = this.cryptoService
      .sha256(`${asset.id}:${asset.ownerId}:${asset.objectKey}:${expiresAtEpoch}`)
      .slice(0, 32);
    // Without a configured bucket (unit tests) the URL is a placeholder and nothing is stored.
    const uploadUrl = this.storage?.enabled
      ? this.storage.presignUpload(asset.objectKey, UPLOAD_URL_TTL_SECONDS)
      : `https://storage.scholink.edu.vn/${asset.objectKey}?token=${uploadToken}&expires=${expiresAtEpoch}`;

    return Object.freeze({
      assetId: asset.id,
      ownerId: asset.ownerId,
      category: asset.category,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      objectKey: asset.objectKey,
      uploadUrl,
      status: asset.status,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
  }

  /**
   * Bước 2 (FR-PROF-04): Xác nhận hoàn tất tải lên, kiểm tra quyền sở hữu (ownerId),
   * đối chiếu chữ ký nhị phân (Magic Bytes) và quét mã độc (EICAR / Embedded JS).
   * Chỉ khi an toàn tuyệt đối mới chuyển sang READY; nếu vi phạm chuyển sang REJECTED.
   */
  async completeUpload(ownerId: string, assetId: string, dto: CompleteUploadDto = {}) {
    const asset = await this.passportRepo.findMediaAssetById(assetId);
    if (!asset) {
      throw DomainException.notFound('MediaAsset');
    }

    // With real storage the scan runs on the stored bytes, never on what the client reports.
    let scan = dto;
    if (this.storage?.enabled && asset.ownerId === ownerId && asset.status === 'UPLOADING') {
      const stored = await this.storage.read(asset.objectKey, MAX_SCAN_BYTES);
      if (!stored) {
        throw DomainException.conflict(
          ErrorCode.ASSET_NOT_AVAILABLE,
          'Chưa nhận được tệp trên kho lưu trữ. Hãy tải tệp lên bằng uploadUrl rồi xác nhận lại.',
        );
      }
      scan = {
        fileHeaderHex: stored.bytes.subarray(0, 16).toString('hex'),
        sampleContent: stored.bytes.toString('latin1'),
        actualSizeBytes: stored.sizeBytes,
      };
    }

    const { updatedAsset, rejectionReason } = asset.inspectAndComplete({
      actorId: ownerId,
      fileHeaderHex: scan.fileHeaderHex,
      sampleContent: scan.sampleContent,
      actualSizeBytes: scan.actualSizeBytes,
    });

    await this.passportRepo.updateMediaAsset(updatedAsset);

    if (rejectionReason) {
      throw DomainException.unprocessable(ErrorCode.MALICIOUS_FILE_DETECTED, rejectionReason);
    }

    return this.toResponse(updatedAsset);
  }

  /**
   * Bước 3: Truy vấn thông tin tệp minh chứng (chỉ chủ sở hữu mới có quyền xem).
   */
  async getMediaAsset(ownerId: string, assetId: string) {
    const asset = await this.passportRepo.findMediaAssetById(assetId);
    if (!asset) {
      throw DomainException.notFound('MediaAsset');
    }

    if (asset.ownerId !== ownerId) {
      throw DomainException.forbidden('Bạn không có quyền truy cập tệp minh chứng của người khác');
    }

    return Object.freeze({
      ...this.toResponse(asset),
      // Short-lived link for the owner only; empty until the file passed the scan.
      downloadUrl:
        this.storage?.enabled && asset.status === 'READY'
          ? this.storage.presignDownload(asset.objectKey, DOWNLOAD_URL_TTL_SECONDS, asset.fileName)
          : '',
    });
  }

  /**
   * A READY file of a Passport with short-lived links, for a caller that is already allowed to
   * see it (the owner, or a viewer the field visibility lets in). Links are empty without a
   * bucket, since then no bytes were stored.
   */
  async fileLink(assetId?: string) {
    if (!assetId) return undefined;
    const asset = await this.passportRepo.findMediaAssetById(assetId);
    if (!asset || asset.status !== 'READY') return undefined;
    // A file "uploaded" while storage was simulated has no bytes in the bucket: no link to a 404.
    const stored = Boolean(this.storage?.enabled) && (await this.storage.exists(asset.objectKey));
    const link = (inline: boolean) =>
      stored ? this.storage.presignDownload(asset.objectKey, DOWNLOAD_URL_TTL_SECONDS, asset.fileName, inline) : '';
    return Object.freeze({
      assetId: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      viewUrl: link(true),
      downloadUrl: link(false),
    });
  }

  /**
   * BR15 & Tiêu chí nghiệm thu F13:
   * Xác minh danh sách assetId đều tồn tại, thuộc quyền sở hữu của `studentId`
   * và đã ở trạng thái `READY`.
   */
  async verifyAssetsUsableByStudent(
    studentId: string,
    assetIds: readonly string[],
  ): Promise<readonly MediaAsset[]> {
    const uniqueIds = [...new Set(assetIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      return Object.freeze([]);
    }

    const foundAssets = await this.passportRepo.findMediaAssetsByIds(uniqueIds);
    const assetMap = new Map<string, MediaAsset>(foundAssets.map((a) => [a.id, a]));

    for (const id of uniqueIds) {
      const asset = assetMap.get(id);
      if (!asset) {
        throw DomainException.conflict(
          ErrorCode.ASSET_NOT_AVAILABLE,
          `Tệp minh chứng (${id}) không tồn tại hoặc chưa được tải lên hệ thống`,
        );
      }
      asset.assertUsableBy(studentId);
    }

    return Object.freeze(
      uniqueIds.map((id) => assetMap.get(id)).filter((a): a is MediaAsset => Boolean(a)),
    );
  }

  private toResponse(asset: MediaAsset) {
    return Object.freeze({
      id: asset.id,
      ownerId: asset.ownerId,
      category: asset.category,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      objectKey: asset.objectKey,
      status: asset.status,
      version: asset.version,
    });
  }
}
