import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface MicroserviceRoute {
  prefix: string;
  serviceName: string;
  defaultPort: number;
  getTargetUrl: () => string;
}

export const MICROSERVICE_ROUTES: MicroserviceRoute[] = [
  {
    prefix: '/api/v1/admin',
    serviceName: 'Identity Microservice',
    defaultPort: 3001,
    getTargetUrl: () => process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001',
  },
  {
    prefix: '/api/v1/teams',
    serviceName: 'Collaboration Microservice',
    defaultPort: 3003,
    getTargetUrl: () => process.env.COLLABORATION_SERVICE_URL || 'http://localhost:3003',
  },
  {
    prefix: '/api/v1/chats',
    serviceName: 'Collaboration Microservice',
    defaultPort: 3003,
    getTargetUrl: () => process.env.COLLABORATION_SERVICE_URL || 'http://localhost:3003',
  },
  {
    prefix: '/api/v1/chat',
    serviceName: 'Collaboration Microservice',
    defaultPort: 3003,
    getTargetUrl: () => process.env.COLLABORATION_SERVICE_URL || 'http://localhost:3003',
  },
  {
    prefix: '/api/v1/wallets',
    serviceName: 'Billing Microservice',
    defaultPort: 3004,
    getTargetUrl: () => process.env.BILLING_SERVICE_URL || 'http://localhost:3004',
  },
  {
    prefix: '/api/v1/wallet',
    serviceName: 'Billing Microservice',
    defaultPort: 3004,
    getTargetUrl: () => process.env.BILLING_SERVICE_URL || 'http://localhost:3004',
  },
  {
    prefix: '/api/v1/payments',
    serviceName: 'Billing Microservice',
    defaultPort: 3004,
    getTargetUrl: () => process.env.BILLING_SERVICE_URL || 'http://localhost:3004',
  },
  {
    prefix: '/api/v1/notifications',
    serviceName: 'Notification Microservice',
    defaultPort: 3005,
    getTargetUrl: () => process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
  },
];

/** Paths that only other microservices may call (see ReverseProxyMiddleware.use). */
const INTERNAL_ONLY_PREFIXES = [
  '/api/v1/notifications/events/',
  '/api/v1/notifications/transactional',
  '/api/v1/notifications/reminders',
];

export function isInternalOnlyPath(originalUrl: string): boolean {
  let path = originalUrl.split('?')[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed escapes: match on the raw path.
  }
  path = path.toLowerCase().replace(/\/{2,}/g, '/');
  return INTERNAL_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix));
}

@Injectable()
export class ReverseProxyMiddleware implements NestMiddleware {
  private readonly logger = new Logger('ReverseProxy');

  use(req: Request, res: Response, next: NextFunction) {
    const originalUrl = req.originalUrl || req.url;

    // SCHOL-14: Admin organizations endpoint is explicitly managed by GatewayAdminOrgController
    if (originalUrl.startsWith('/api/v1/admin/organizations')) {
      return next();
    }

    // F32: Admin opportunities and crawler review endpoint is managed by GatewayAdminOpportunityController
    if (originalUrl.startsWith('/api/v1/admin/opportunities')) {
      return next();
    }

    // NOTI-02: service-to-service endpoints of the Notification Service (bookmark/opportunity
    // events, transactional inserts, reminder debug list) are @Public inside the service and
    // must never be reachable from clients through the gateway.
    if (isInternalOnlyPath(originalUrl)) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Không tìm thấy tài nguyên.',
          correlationId: (req.headers['x-correlation-id'] as string) || undefined,
        },
      });
      return;
    }

    // Check if request matches any downstream microservice route
    const matchedRoute = MICROSERVICE_ROUTES.find((route) =>
      originalUrl.startsWith(route.prefix),
    );

    if (!matchedRoute) {
      return next();
    }

    const targetBase = matchedRoute.getTargetUrl();
    const targetUrl = new URL(originalUrl, targetBase);

    this.logger.log(`[Proxy] ${req.method} ${originalUrl} -> ${targetUrl.toString()}`);

    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    // Clone headers and remove host & connection headers
    const forwardedHeaders: http.OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'connection') {
        if (value !== undefined) {
          forwardedHeaders[key] = value;
        }
      }
    }

    // Prepare body if parsed
    let bodyData: string | Buffer | null = null;
    if (req.body && Object.keys(req.body).length > 0) {
      if (Buffer.isBuffer(req.body)) {
        bodyData = req.body;
      } else if (typeof req.body === 'string') {
        bodyData = req.body;
      } else {
        bodyData = JSON.stringify(req.body);
      }
      forwardedHeaders['content-type'] = req.headers['content-type'] || 'application/json';
      forwardedHeaders['content-length'] = Buffer.byteLength(bodyData);
    }

    const proxyReq = client.request(
      targetUrl.toString(),
      {
        method: req.method,
        headers: forwardedHeaders,
        timeout: 30000,
      },
      (proxyRes) => {
        // Forward response status & headers
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      },
    );

    proxyReq.on('error', (err: any) => {
      this.logger.error(
        `[Proxy Error] ${req.method} ${originalUrl} to ${matchedRoute.serviceName} (${targetBase}): ${err.message}`,
      );
      if (!res.headersSent) {
        res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `Dịch vụ ${matchedRoute.serviceName} hiện không phản hồi trên cổng ${matchedRoute.defaultPort}. Vui lòng kiểm tra microservice đã được khởi động.`,
            details: {
              target: targetUrl.toString(),
              error: err.code || err.message,
            },
            correlationId: (req.headers['x-correlation-id'] as string) || undefined,
          },
        });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          error: {
            code: 'GATEWAY_TIMEOUT',
            message: `Hết thời gian chờ phản hồi từ ${matchedRoute.serviceName}.`,
            correlationId: (req.headers['x-correlation-id'] as string) || undefined,
          },
        });
      }
    });

    if (bodyData) {
      proxyReq.write(bodyData);
      proxyReq.end();
    } else if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') {
      proxyReq.end();
    } else {
      req.pipe(proxyReq, { end: true });
    }
  }
}
