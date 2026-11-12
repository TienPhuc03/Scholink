import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';

const REGION = 'us-east-1';
const SERVICE = 's3';

const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac('sha256', key).update(data).digest();
const sha256Hex = (data: string) => crypto.createHash('sha256').update(data).digest('hex');
// RFC 3986 encoding as SigV4 requires (encodeURIComponent leaves !*'() unescaped).
const rfc3986 = (v: string) =>
  encodeURIComponent(v).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Presigned-URL signer for an S3-compatible bucket (MinIO, FR-PROF-04). Pure function so it can
 * be checked against the published AWS SigV4 example without a running bucket.
 */
export function presignS3Url(params: {
  method: 'GET' | 'PUT' | 'HEAD';
  origin: string; // e.g. http://localhost:9000
  bucket: string;
  objectKey?: string;
  accessKey: string;
  secretKey: string;
  expiresInSeconds: number;
  now?: Date;
  region?: string;
  extraQuery?: Record<string, string>;
}): string {
  const region = params.region ?? REGION;
  const url = new URL(params.origin);
  const amzDate = (params.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${SERVICE}/aws4_request`;
  const path = `/${[params.bucket, ...(params.objectKey ? params.objectKey.split('/') : [])].map(rfc3986).join('/')}`;
  const query: Record<string, string> = {
    ...(params.extraQuery ?? {}),
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${params.accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(params.expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join('&');
  const canonicalRequest = [params.method, path, canonicalQuery, `host:${url.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join(
    '\n',
  );
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${params.secretKey}`, date), region), SERVICE), 'aws4_request');
  const signature = hmac(signingKey, stringToSign).toString('hex');
  return `${url.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export interface StoredObject {
  readonly sizeBytes: number;
  readonly bytes: Buffer;
}

/**
 * Private object storage for uploaded evidence. Clients upload and download through short-lived
 * presigned URLs; the bucket itself is never public. Disabled (and `MediaUseCase` falls back to the
 * client-reported scan hints) when `MINIO_ENDPOINT` is not set, e.g. in unit tests.
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly endpoint = process.env.MINIO_ENDPOINT;
  private readonly port = process.env.MINIO_PORT || '9000';
  private readonly bucket = process.env.MINIO_BUCKET || 'scholink-documents';
  private readonly accessKey = process.env.MINIO_ACCESS_KEY || '';
  private readonly secretKey = process.env.MINIO_SECRET_KEY || '';
  private readonly scheme = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';

  private reachable = false;

  private get configured(): boolean {
    return Boolean(this.endpoint && this.accessKey && this.secretKey) && process.env.NODE_ENV !== 'test';
  }

  /** True only when the bucket answered at startup, so an offline MinIO never breaks uploads. */
  get enabled(): boolean {
    return this.configured && this.reachable;
  }

  /** Origin the services use to reach the bucket. */
  private get internalOrigin(): string {
    return `${this.scheme}://${this.endpoint}:${this.port}`;
  }

  /** Origin handed to clients (the Android emulator reaches the host as 10.0.2.2). */
  private get publicOrigin(): string {
    return `${this.scheme}://${process.env.MINIO_PUBLIC_ENDPOINT || this.endpoint}:${this.port}`;
  }

  private sign(method: 'GET' | 'PUT' | 'HEAD', origin: string, objectKey: string | undefined, ttl: number, extra?: Record<string, string>) {
    return presignS3Url({
      method,
      origin,
      bucket: this.bucket,
      objectKey,
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      expiresInSeconds: ttl,
      extraQuery: extra,
    });
  }

  async onModuleInit() {
    if (!this.configured) {
      this.logger.warn('Object storage chưa cấu hình (MINIO_ENDPOINT): upload URL là giả lập, không lưu tệp.');
      return;
    }
    try {
      // Creating an existing bucket answers 409, which is fine.
      const res = await fetch(this.sign('PUT', this.internalOrigin, undefined, 60), { method: 'PUT' });
      if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
      this.reachable = true;
      this.logger.log(`Object storage sẵn sàng: bucket ${this.bucket}`);
    } catch (err: any) {
      // shortcut: reachability is checked once at startup; restart the service after MinIO comes up.
      this.logger.error(
        `Không kết nối được bucket ${this.bucket} (${err.message}); dùng upload giả lập cho tới khi khởi động lại.`,
      );
    }
  }

  presignUpload(objectKey: string, ttlSeconds: number): string {
    return this.sign('PUT', this.publicOrigin, objectKey, ttlSeconds);
  }

  presignDownload(objectKey: string, ttlSeconds: number, fileName: string): string {
    return this.sign('GET', this.publicOrigin, objectKey, ttlSeconds, {
      'response-content-disposition': `attachment; filename="${fileName}"`,
    });
  }

  /** Reads the uploaded object (at most `maxBytes`); `null` when nothing was uploaded. */
  async read(objectKey: string, maxBytes: number): Promise<StoredObject | null> {
    const res = await fetch(this.sign('GET', this.internalOrigin, objectKey, 60), {
      headers: { Range: `bytes=0-${maxBytes - 1}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Object storage trả về HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    // "bytes 0-99/1234": the total after the slash is the real object size.
    const total = Number(res.headers.get('content-range')?.split('/')[1]);
    return { sizeBytes: Number.isFinite(total) && total > 0 ? total : bytes.length, bytes };
  }
}
