import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@shared';
import { MICROSERVICE_ROUTES } from './proxy.middleware';

@ApiTags('Gateway Health')
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Kiểm tra trạng thái API Gateway' })
  @ApiResponse({ status: 200, description: 'Gateway hoạt động bình thường' })
  check() {
    return {
      status: 'ok',
      service: 'api-gateway',
      port: process.env.GATEWAY_PORT || 3000,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      microservices: {
        identity: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001',
        opportunity: process.env.OPPORTUNITY_SERVICE_URL || 'http://localhost:3002',
        collaboration: process.env.COLLABORATION_SERVICE_URL || 'http://localhost:3003',
        billing: process.env.BILLING_SERVICE_URL || 'http://localhost:3004',
        notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
      },
    };
  }

  @Public()
  @Get('routes')
  @ApiOperation({ summary: 'Xem bảng định tuyến Reverse Proxy của API Gateway' })
  @ApiResponse({ status: 200, description: 'Danh sách các tiền tố route và microservice phụ trách' })
  getRoutes() {
    return {
      gatewayPort: process.env.GATEWAY_PORT || 3000,
      routes: MICROSERVICE_ROUTES.map((r) => ({
        prefix: r.prefix,
        service: r.serviceName,
        targetUrl: r.getTargetUrl(),
        defaultPort: r.defaultPort,
      })),
    };
  }
}
