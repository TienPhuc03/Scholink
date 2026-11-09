import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly secretKey: Buffer;

  constructor(@Optional() private readonly configService?: ConfigService) {
    const rawKey =
      this.configService?.get<string>('ENCRYPTION_KEY') ||
      process.env.ENCRYPTION_KEY ||
      'scholink-pii-secret-encryption-key-32ch!';
    this.secretKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  public canonicalizeJson(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalizeJson(item)).join(',') + ']';
    }

    const record = obj as Record<string, unknown>;
    const sortedKeys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const keyValues = sortedKeys.map(
      (key) => `${JSON.stringify(key)}:${this.canonicalizeJson(record[key])}`,
    );
    return '{' + keyValues.join(',') + '}';
  }

  public generatePayloadHash(payload: Record<string, unknown>): string {
    const canonical = this.canonicalizeJson(payload);
    return this.sha256(canonical);
  }

  public sha256(input: string): string {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }

  public encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  public decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Định dạng dữ liệu mã hóa không hợp lệ');
    }
    const [ivHex, authTagHex, encryptedText] = parts;
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.secretKey,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
