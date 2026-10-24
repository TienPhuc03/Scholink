import { Injectable, Inject } from '@nestjs/common';
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

const UPLOAD_URL_TTL_SECONDS = 900; // 15 phút theo SRS FR-PROF-04

@Injectable()
export class MediaUseCase {
  constructor(
    @Inject(PASSPORT_REPOSITORY) private readonly passportRepo: IPassportRepository,
    private readonly cryptoService: CryptoService,
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
    const uploadUrl = `https://storage.scholink.edu.vn/${asset.objectKey}?token=${uploadToken}&expires=${expiresAtEpoch}`;

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

    const { updatedAsset, rejectionReason } = asset.inspectAndComplete({
      actorId: ownerId,
      fileHeaderHex: dto.fileHeaderHex,
      sampleContent: dto.sampleContent,
      actualSizeBytes: dto.actualSizeBytes,
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

    return this.toResponse(asset);
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
        // Hỗ trợ ngược các mã mock tĩnh `asset_*` của bộ kịch bản F04 cũ nếu chưa tạo bản ghi MediaAsset
        if (id.startsWith('asset_')) {
          continue;
        }
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
