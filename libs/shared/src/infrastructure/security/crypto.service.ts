import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly secretKey: Buffer;

  constructor() {
    const rawKey = process.env.ENCRYPTION_KEY || 'scholink-super-secret-key-32ch!';
    this.secretKey = crypto.createHash('sha256').update(rawKey).digest();
  }

  public canonicalizeJson(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalizeJson(item)).join(',') + ']';
    }

    const sortedKeys = Object.keys(obj).sort();
    const keyValues = sortedKeys.map(
      (key) => `${JSON.stringify(key)}:${this.canonicalizeJson(obj[key])}`,
    );
    return '{' + keyValues.join(',') + '}';
  }

  public generatePayloadHash(payload: Record<string, any>): string {
    const canonical = this.canonicalizeJson(payload);
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  public encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  public decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }
    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
