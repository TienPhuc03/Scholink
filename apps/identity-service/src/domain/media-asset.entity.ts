import * as crypto from 'crypto';
import { AggregateRoot, DomainException, ErrorCode, MediaCategory } from '@shared';

export type MediaAssetStatus = 'UPLOADING' | 'SCANNING' | 'READY' | 'REJECTED';

const MB = 1024 * 1024;

interface CategoryPolicy {
  readonly allowedMimeTypes: readonly string[];
  readonly maxSizeBytes: number;
}

/**
 * Chính sách kiểm duyệt tệp theo từng mục đích sử dụng (SRS Mục 12A.2 & FR-PROF-04):
 * - Ảnh đại diện (AVATAR): JPEG/PNG/WebP <= 5MB
 * - Hồ sơ CV / Đính kèm đơn (CV, ATTACHMENT): PDF <= 5MB
 * - Chứng chỉ / Thành tích (CERTIFICATE, ACHIEVEMENT): PDF/JPEG/PNG/WebP <= 5MB
 * - Video giới thiệu (PITCH_VIDEO): MP4 <= 20MB
 */
const CATEGORY_POLICIES: Readonly<Record<MediaCategory, CategoryPolicy>> = Object.freeze({
  AVATAR: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * MB,
  },
  CV: {
    allowedMimeTypes: ['application/pdf'],
    maxSizeBytes: 5 * MB,
  },
  ATTACHMENT: {
    allowedMimeTypes: ['application/pdf'],
    maxSizeBytes: 5 * MB,
  },
  CERTIFICATE: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * MB,
  },
  ACHIEVEMENT: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * MB,
  },
  PITCH_VIDEO: {
    allowedMimeTypes: ['video/mp4'],
    maxSizeBytes: 20 * MB,
  },
});

/**
 * Magic Bytes (chữ ký nhị phân đầu file ở dạng hex chữ thường) theo MIME type để chống giả mạo phần mở rộng (.exe đổi tên thành .pdf).
 */
const EXPECTED_MAGIC_HEX_PREFIXES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'application/pdf': ['25504446'], // %PDF
  'image/png': ['89504e47'], // .PNG
  'image/jpeg': ['ffd8ff'], // JPEG SOI
  'image/webp': ['52494646'], // RIFF
  'video/mp4': ['0000001866747970', '0000001c66747970', '0000002066747970', '66747970'], // ftyp
});

/**
 * Các mẫu chữ ký mã độc / kịch bản độc hại nhúng trong tệp (EICAR test signature, PDF JavaScript action, XSS script, PE/ELF binary).
 */
const MALICIOUS_CONTENT_PATTERNS: readonly RegExp[] = Object.freeze([
  /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/i,
  /EICAR-STANDARD-ANTIVIRUS-TEST-FILE/i,
  /\/JavaScript\b/i,
  /\/JS\s*\(/i,
  /\/Launch\b/i,
  /<script\b/i,
]);

export interface MediaAssetProps {
  readonly ownerId: string;
  readonly category: MediaCategory;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly objectKey: string;
  readonly status: MediaAssetStatus;
  readonly version?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class MediaAsset extends AggregateRoot<string> {
  private readonly _props: Readonly<MediaAssetProps>;

  constructor(id: string, props: MediaAssetProps) {
    super(
      id,
      props.version ?? 1,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
    );
    this._props = Object.freeze({
      ...props,
      fileName: MediaAsset.sanitizeFileName(props.fileName),
      mimeType: props.mimeType.trim().toLowerCase(),
      version: props.version ?? 1,
    });
    Object.freeze(this);
  }

  get ownerId(): string {
    return this._props.ownerId;
  }

  get category(): MediaCategory {
    return this._props.category;
  }

  get fileName(): string {
    return this._props.fileName;
  }

  get mimeType(): string {
    return this._props.mimeType;
  }

  get sizeBytes(): number {
    return this._props.sizeBytes;
  }

  get sha256(): string {
    return this._props.sha256;
  }

  get objectKey(): string {
    return this._props.objectKey;
  }

  get status(): MediaAssetStatus {
    return this._props.status;
  }

  get props(): Readonly<MediaAssetProps> {
    return this._props;
  }

  /**
   * Làm sạch tên tệp: chống Path Traversal (../) và ký tự đặc biệt.
   */
  public static sanitizeFileName(rawName: string): string {
    const base = rawName.replace(/\\/g, '/').split('/').pop() ?? 'file';
    const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    return cleaned || 'asset_file';
  }

  /**
   * Kiểm tra MIME type và dung lượng tại biên, sau đó tạo thực thể MediaAsset ở trạng thái UPLOADING.
   */
  public static createInitiated(params: {
    id: string;
    ownerId: string;
    category: MediaCategory;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256?: string;
  }): MediaAsset {
    const policy = CATEGORY_POLICIES[params.category];
    const normalizedMime = params.mimeType.trim().toLowerCase();

    if (!policy || !policy.allowedMimeTypes.includes(normalizedMime)) {
      throw new DomainException(
        ErrorCode.INVALID_FILE_TYPE,
        `Định dạng tệp '${normalizedMime}' không được phép cho danh mục ${params.category}. Chỉ chấp nhận: ${policy?.allowedMimeTypes.join(', ')}`,
        400,
      );
    }

    if (params.sizeBytes <= 0 || params.sizeBytes > policy.maxSizeBytes) {
      const maxMb = Math.round(policy.maxSizeBytes / MB);
      throw new DomainException(
        ErrorCode.FILE_TOO_LARGE,
        `Dung lượng tệp vượt quá giới hạn cho phép (${maxMb}MB) của danh mục ${params.category}`,
        400,
      );
    }

    const safeFileName = MediaAsset.sanitizeFileName(params.fileName);
    const objectKey = `uploads/${params.ownerId}/${params.category.toLowerCase()}/${params.id}-${safeFileName}`;
    const resolvedSha256 =
      params.sha256 ??
      crypto
        .createHash('sha256')
        .update(`${params.ownerId}:${params.id}:${safeFileName}:${params.sizeBytes}`)
        .digest('hex');

    return new MediaAsset(params.id, {
      ownerId: params.ownerId,
      category: params.category,
      fileName: safeFileName,
      mimeType: normalizedMime,
      sizeBytes: params.sizeBytes,
      sha256: resolvedSha256,
      objectKey,
      status: 'UPLOADING',
      version: 1,
    });
  }

  /**
   * Quét chữ ký Magic Bytes, dung lượng thực tế và nội dung mã độc trước khi chuyển sang READY hoặc REJECTED.
   */
  public inspectAndComplete(params: {
    actorId: string;
    fileHeaderHex?: string;
    sampleContent?: string;
    actualSizeBytes?: number;
  }): { readonly updatedAsset: MediaAsset; readonly rejectionReason?: string } {
    if (this._props.ownerId !== params.actorId) {
      throw DomainException.forbidden('Bạn không có quyền hoàn tất hoặc thao tác trên tệp của người khác');
    }

    const policy = CATEGORY_POLICIES[this._props.category];
    if (
      params.actualSizeBytes !== undefined &&
      (params.actualSizeBytes <= 0 || params.actualSizeBytes > policy.maxSizeBytes)
    ) {
      return Object.freeze({
        updatedAsset: this.withStatus('REJECTED'),
        rejectionReason: 'Dung lượng tệp thực tế vượt quá giới hạn cho phép',
      });
    }

    // 1. Kiểm tra chữ ký nhị phân (Magic Bytes) nếu có gửi kèm hoặc chặn mã thực thi PE (4d5a = MZ) / ELF (7f454c46)
    if (params.fileHeaderHex) {
      const normalizedHex = params.fileHeaderHex.trim().toLowerCase();
      if (normalizedHex.startsWith('4d5a') || normalizedHex.startsWith('7f454c46')) {
        return Object.freeze({
          updatedAsset: this.withStatus('REJECTED'),
          rejectionReason: 'Phát hiện tệp thực thi nhị phân nguy hiểm (PE/ELF executable)',
        });
      }

      const allowedPrefixes = EXPECTED_MAGIC_HEX_PREFIXES[this._props.mimeType] ?? [];
      const matchesMagic = allowedPrefixes.some(
        (prefix) => normalizedHex.startsWith(prefix) || normalizedHex.includes(prefix),
      );
      if (allowedPrefixes.length > 0 && !matchesMagic) {
        return Object.freeze({
          updatedAsset: this.withStatus('REJECTED'),
          rejectionReason: `Chữ ký tệp (Magic Bytes) không khớp với định dạng khai báo ${this._props.mimeType}`,
        });
      }
    }

    // 2. Quét mẫu nội dung tìm mã độc EICAR / Embedded PDF JavaScript / XSS script
    if (params.sampleContent) {
      for (const pattern of MALICIOUS_CONTENT_PATTERNS) {
        if (pattern.test(params.sampleContent)) {
          return Object.freeze({
            updatedAsset: this.withStatus('REJECTED'),
            rejectionReason: 'Phát hiện mã độc hoặc kịch bản nhúng nguy hiểm trong tệp tải lên',
          });
        }
      }
    }

    return Object.freeze({
      updatedAsset: this.withStatus('READY', params.actualSizeBytes),
    });
  }

  /**
   * BR15 & Tiêu chí nghiệm thu F13:
   * - Không nhận asset người khác (ownerId !== studentId -> 403 FORBIDDEN_RESOURCE)
   * - Asset READY mới được dùng (status !== 'READY' -> 409 ASSET_NOT_AVAILABLE)
   */
  public assertUsableBy(studentId: string): void {
    if (this._props.ownerId !== studentId) {
      throw DomainException.forbidden(
        `Không được phép gắn hoặc sử dụng tệp minh chứng (${this.id}) của người dùng khác`,
      );
    }

    if (this._props.status !== 'READY') {
      throw DomainException.conflict(
        ErrorCode.ASSET_NOT_AVAILABLE,
        `Tệp minh chứng (${this.id}) đang ở trạng thái '${this._props.status}', chỉ tệp ở trạng thái READY mới được sử dụng`,
      );
    }
  }

  public markRejected(): MediaAsset {
    return this.withStatus('REJECTED');
  }

  private withStatus(nextStatus: MediaAssetStatus, actualSizeBytes?: number): MediaAsset {
    return new MediaAsset(this.id, {
      ...this._props,
      sizeBytes: actualSizeBytes ?? this._props.sizeBytes,
      status: nextStatus,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }
}
