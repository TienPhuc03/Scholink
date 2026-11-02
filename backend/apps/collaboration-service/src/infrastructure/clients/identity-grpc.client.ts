import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  IIdentityClientPort,
  MemberProfileValidationResult,
} from '../../domain/ports/identity-client.port';

@Injectable()
export class IdentityGrpcClient implements IIdentityClientPort, OnModuleInit {
  private readonly logger = new Logger(IdentityGrpcClient.name);
  private grpcService?: any;

  constructor(
    @Optional()
    @Inject('IDENTITY_GRPC_PACKAGE')
    private readonly clientGrpc?: ClientGrpc,
  ) {}

  onModuleInit() {
    if (this.clientGrpc) {
      try {
        this.grpcService = this.clientGrpc.getService<any>('IdentityGrpcService');
      } catch (err: any) {
        this.logger.warn(`Could not resolve IdentityGrpcService: ${err.message}`);
      }
    }
  }

  async validateMemberProfile(studentId: string): Promise<MemberProfileValidationResult> {
    if (this.grpcService && typeof this.grpcService.getProfileSnapshot === 'function') {
      try {
        const res = await firstValueFrom(
          this.grpcService.getProfileSnapshot({
            studentId,
            attachmentIds: [],
          }),
        );
        if (res.missingFields && res.missingFields.length > 0) {
          return {
            isValid: false,
            completionScore: res.completionScore,
            missingFields: res.missingFields,
            message: `Hồ sơ còn thiếu trường bắt buộc: ${res.missingFields.join(', ')}`,
          };
        }
        return {
          isValid: true,
          completionScore: res.completionScore ?? 100,
        };
      } catch (err: any) {
        this.logger.warn(`Failed to validate member profile for ${studentId} via gRPC: ${err.message}`);
      }
    }

    // Default fallback in standalone / mocked environment
    return { isValid: true, completionScore: 100 };
  }
}
