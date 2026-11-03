import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.initClient();
  }

  private initClient(): void {
    const host =
      this.configService?.get<string>('REDIS_HOST') ||
      process.env.REDIS_HOST ||
      'localhost';
    const port = Number(
      this.configService?.get<number>('REDIS_PORT') ||
        process.env.REDIS_PORT ||
        6379,
    );

    try {
      this.client = new Redis({
        host,
        port,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying after 3 attempts if Redis is not running
          }
          return Math.min(times * 500, 2000);
        },
        connectTimeout: 3000,
        lazyConnect: true,
      });

      this.client.connect().then(() => {
        this.isConnected = true;
        this.logger.log(`⚡ Kết nối Redis thành công tại ${host}:${port}`);
      }).catch((err) => {
        this.isConnected = false;
        this.logger.warn(`⚠️  Không thể kết nối Redis tại ${host}:${port} (${err.message}). Tự động kích hoạt cơ chế Local Fallback Cache.`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.debug(`[Redis Warning] ${err.message}`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    } catch (err: any) {
      this.isConnected = false;
      this.logger.warn(`Khởi tạo Redis client thất bại: ${err.message}`);
    }
  }

  public get isAvailable(): boolean {
    return this.isConnected && this.client !== null && this.client.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.isAvailable || !this.client) return false;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch {
      return false;
    }
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isAvailable || !this.client) return false;
    try {
      const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch {
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isAvailable || !this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }
}
