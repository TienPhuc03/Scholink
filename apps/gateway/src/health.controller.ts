import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@shared';

export const GRPC_ROUTING_TABLE = Object.freeze([
  {
    prefix: '/api/v1/auth',
    service: 'IdentityGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50051',
  },
  {
    prefix: '/api/v1/profiles',
    service: 'IdentityGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50051',
  },
  {
    prefix: '/api/v1/opportunities',
    service: 'OpportunityGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50052',
  },
  {
    prefix: '/api/v1/applications',
    service: 'OpportunityGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50052',
  },
  {
    prefix: '/api/v1/teams',
    service: 'CollaborationGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50053',
  },
  {
    prefix: '/api/v1/chats',
    service: 'CollaborationGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50053',
  },
  {
    prefix: '/api/v1/wallets',
    service: 'BillingGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50054',
  },
  {
    prefix: '/api/v1/notifications',
    service: 'NotificationGrpcService',
    transport: 'gRPC',
    defaultTarget: 'localhost:50055',
  },
]);

@ApiTags('Gateway Health')
@Controller()
export class HealthController {
  @Public()
  @Get(['health', 'api/v1/health'])
  @ApiOperation({ summary: 'Kiểm tra trạng thái API Gateway và cấu hình gRPC Downstream' })
  @ApiResponse({ status: 200, description: 'Gateway hoạt động bình thường' })
  check() {
    return {
      status: 'ok',
      service: 'api-gateway',
      transport: 'HTTP/REST -> gRPC',
      port: Number(process.env.GATEWAY_PORT || 3000),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      grpcMicroservices: {
        identity: process.env.IDENTITY_GRPC_URL || 'localhost:50051',
        opportunity: process.env.OPPORTUNITY_GRPC_URL || 'localhost:50052',
        collaboration: process.env.COLLABORATION_GRPC_URL || 'localhost:50053',
        billing: process.env.BILLING_GRPC_URL || 'localhost:50054',
        notification: process.env.NOTIFICATION_GRPC_URL || 'localhost:50055',
      },
    };
  }

  @Public()
  @Get(['routes', 'api/v1/routes'])
  @ApiOperation({ summary: 'Xem bảng định tuyến gRPC của API Gateway' })
  @ApiResponse({ status: 200, description: 'Danh sách các tiền tố route và gRPC microservice phụ trách' })
  getRoutes() {
    return {
      gatewayPort: Number(process.env.GATEWAY_PORT || 3000),
      routes: GRPC_ROUTING_TABLE,
    };
  }
}
