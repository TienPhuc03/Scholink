import { Controller, UseFilters } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthUseCase } from '../application/use-cases/auth.use-case';
import { RegisterDto, LoginDto, RefreshTokenDto } from '../application/dtos/auth.dto';
import { GrpcExceptionFilter } from '@shared';

@UseFilters(GrpcExceptionFilter)
@Controller()
export class AuthController {
  constructor(private readonly authUseCase: AuthUseCase) {}

  @GrpcMethod('IdentityGrpcService', 'Register')
  async register(dto: RegisterDto) {
    return this.authUseCase.register(dto);
  }

  @GrpcMethod('IdentityGrpcService', 'Login')
  async login(dto: LoginDto) {
    return this.authUseCase.login(dto);
  }

  @GrpcMethod('IdentityGrpcService', 'Refresh')
  async refresh(dto: RefreshTokenDto) {
    return this.authUseCase.refresh(dto);
  }

  @GrpcMethod('IdentityGrpcService', 'Logout')
  async logout(data: { userId: string; sessionId?: string }) {
    return this.authUseCase.logout(data.userId, data.sessionId);
  }
}
